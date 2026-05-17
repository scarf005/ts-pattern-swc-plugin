use std::collections::HashSet;

use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        utils::{private_ident, quote_ident},
        visit::{VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

#[plugin_transform]
pub fn process_transform(program: Program, _metadata: TransformPluginProgramMetadata) -> Program {
    let mut transformer = TsPatternTransformer::default();
    let mut program = program;
    program.visit_mut_with(&mut transformer);
    program
}

#[derive(Default)]
struct TsPatternTransformer {
    match_imports: HashSet<Id>,
    p_imports: HashSet<Id>,
    namespaces: HashSet<Id>,
    non_exhaustive_error: Option<Expr>,
    needs_non_exhaustive_error_import: bool,
}

#[derive(Clone)]
struct MatchChain {
    input: Box<Expr>,
    arms: Vec<MatchArm>,
    fallback: Fallback,
}

#[derive(Clone)]
struct MatchArm {
    patterns: Vec<Box<Expr>>,
    guard: Option<Box<Expr>>,
    handler: Box<Expr>,
}

#[derive(Clone)]
enum Fallback {
    Otherwise(Box<Expr>),
    Exhaustive,
}

#[derive(Clone)]
struct SelectionBinding {
    name: Option<String>,
    value: Expr,
}

impl VisitMut for TsPatternTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.collect_imports(module);
        module.visit_mut_children_with(self);
        if self.needs_non_exhaustive_error_import {
            add_non_exhaustive_error_import(module);
        }
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        if let Some(chain) = self.parse_match_chain(expr) {
            if let Some(compiled) = self.compile_chain(chain) {
                *expr = compiled;
            }
        }
    }

    fn visit_mut_arrow_expr(&mut self, arrow: &mut ArrowExpr) {
        if let BlockStmtOrExpr::Expr(expr) = &*arrow.body {
            if let Some(chain) = self.parse_match_chain(expr) {
                if chain.arms.iter().all(is_switchable_arm) {
                    arrow.body = Box::new(BlockStmtOrExpr::BlockStmt(BlockStmt {
                        span: DUMMY_SP,
                        ctxt: Default::default(),
                        stmts: self.compile_switch_stmts(chain),
                    }));
                    return;
                }
            }
        }

        arrow.visit_mut_children_with(self);
    }
}

impl TsPatternTransformer {
    fn collect_imports(&mut self, module: &Module) {
        for item in &module.body {
            let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item else {
                continue;
            };

            if !is_ts_pattern_import(&import.src.value.to_string_lossy()) {
                continue;
            }

            for specifier in &import.specifiers {
                match specifier {
                    ImportSpecifier::Named(named) => {
                        let imported = named
                            .imported
                            .as_ref()
                            .map(module_export_name)
                            .unwrap_or_else(|| named.local.sym.to_string());

                        match imported.as_str() {
                            "match" => {
                                self.match_imports.insert(named.local.to_id());
                            }
                            "P" => {
                                self.p_imports.insert(named.local.to_id());
                            }
                            "NonExhaustiveError" => {
                                self.non_exhaustive_error =
                                    Some(Expr::Ident(named.local.clone().into()));
                            }
                            _ => {}
                        }
                    }
                    ImportSpecifier::Namespace(namespace) => {
                        self.namespaces.insert(namespace.local.to_id());
                        self.non_exhaustive_error = Some(member_expr(
                            Expr::Ident(namespace.local.clone().into()),
                            "NonExhaustiveError",
                        ));
                    }
                    ImportSpecifier::Default(_) => {}
                }
            }
        }
    }

    fn parse_match_chain(&self, expr: &Expr) -> Option<MatchChain> {
        let call = as_call(expr)?;
        let (method, receiver) = as_method_call(call)?;

        let fallback = match method.as_str() {
            "otherwise" => {
                if call.args.len() != 1 {
                    return None;
                }
                Fallback::Otherwise(call.args[0].expr.clone())
            }
            "exhaustive" => {
                if !call.args.is_empty() {
                    return None;
                }
                Fallback::Exhaustive
            }
            _ => return None,
        };

        let (input, arms) = self.collect_arms(receiver)?;
        if arms.is_empty() {
            return None;
        }

        Some(MatchChain {
            input,
            arms,
            fallback,
        })
    }

    fn collect_arms(&self, expr: &Expr) -> Option<(Box<Expr>, Vec<MatchArm>)> {
        let call = as_call(expr)?;

        if self.is_match_call(call) {
            if call.args.len() != 1 {
                return None;
            }
            return Some((call.args[0].expr.clone(), Vec::new()));
        }

        let (method, receiver) = as_method_call(call)?;
        let (input, mut arms) = self.collect_arms(receiver)?;

        match method.as_str() {
            "with" => {
                let arm = parse_with_arm(call)?;
                arms.push(arm);
            }
            "when" => {
                let arm = parse_when_arm(call)?;
                arms.push(arm);
            }
            _ => return None,
        }

        Some((input, arms))
    }

    fn is_match_call(&self, call: &CallExpr) -> bool {
        match &call.callee {
            Callee::Expr(callee) => match &**callee {
                Expr::Ident(ident) => self.match_imports.contains(&ident.to_id()),
                Expr::Member(member) => self.is_namespace_member(member, "match"),
                _ => false,
            },
            _ => false,
        }
    }

    fn is_p_member(&self, expr: &Expr, name: &str) -> bool {
        let Expr::Member(member) = expr else {
            return false;
        };

        if member_name(member) != Some(name) {
            return false;
        }

        match &*member.obj {
            Expr::Ident(ident) => self.p_imports.contains(&ident.to_id()),
            Expr::Member(parent) => self.is_namespace_member(parent, "P"),
            _ => false,
        }
    }

    fn is_p_call<'a>(&self, expr: &'a Expr, name: &str) -> Option<&'a CallExpr> {
        let call = as_call(expr)?;
        let Callee::Expr(callee) = &call.callee else {
            return None;
        };

        if self.is_p_member(callee, name) {
            Some(call)
        } else {
            None
        }
    }

    fn is_namespace_member(&self, member: &MemberExpr, name: &str) -> bool {
        if member_name(member) != Some(name) {
            return false;
        }

        match &*member.obj {
            Expr::Ident(ident) => self.namespaces.contains(&ident.to_id()),
            _ => false,
        }
    }

    fn compile_chain(&mut self, chain: MatchChain) -> Option<Expr> {
        if chain.arms.iter().all(is_switchable_arm) {
            Some(self.compile_switch(chain))
        } else {
            self.compile_if_chain(chain)
        }
    }

    fn compile_switch(&mut self, chain: MatchChain) -> Expr {
        iife(self.compile_switch_stmts(chain))
    }

    fn compile_switch_stmts(&mut self, chain: MatchChain) -> Vec<Stmt> {
        let input_ident = private_ident!("_tsPatternInput");
        let input_expr = ident_expr(&input_ident);
        let mut cases = Vec::new();

        for arm in chain.arms {
            let handler_call = handler_result(arm.handler, input_expr.clone());
            let mut arm_patterns = arm.patterns.into_iter().peekable();

            while let Some(pattern) = arm_patterns.next() {
                let consequent = if arm_patterns.peek().is_some() {
                    Vec::new()
                } else {
                    vec![return_stmt(handler_call.clone())]
                };

                cases.push(SwitchCase {
                    span: DUMMY_SP,
                    test: Some(pattern),
                    cons: consequent,
                });
            }
        }

        let exhaustive_error_callee =
            matches!(chain.fallback, Fallback::Exhaustive).then(|| self.exhaustive_error_callee());
        cases.push(SwitchCase {
            span: DUMMY_SP,
            test: None,
            cons: fallback_stmts(chain.fallback, input_expr, exhaustive_error_callee),
        });

        vec![
            const_stmt(input_ident.clone(), *chain.input),
            Stmt::Switch(SwitchStmt {
                span: DUMMY_SP,
                discriminant: Box::new(ident_expr(&input_ident)),
                cases,
            }),
        ]
    }

    fn compile_if_chain(&mut self, chain: MatchChain) -> Option<Expr> {
        if can_inline_input(&chain.input) && matches!(chain.fallback, Fallback::Otherwise(_)) {
            let input = *chain.input;
            let mut expression = fallback_expr(chain.fallback, input.clone(), None);

            for arm in chain.arms.into_iter().rev() {
                let handler_input = arm_handler_input(self, input.clone(), &arm)?;
                expression = cond_expr(
                    arm_test(self, input.clone(), &arm)?,
                    handler_result(arm.handler, handler_input),
                    expression,
                );
            }

            return Some(expression);
        }

        let input_ident = private_ident!("_tsPatternInput");
        let exhaustive_error_callee =
            matches!(chain.fallback, Fallback::Exhaustive).then(|| self.exhaustive_error_callee());
        let mut expression = fallback_expr(
            chain.fallback,
            ident_expr(&input_ident),
            exhaustive_error_callee,
        );

        for arm in chain.arms.into_iter().rev() {
            let handler_input = arm_handler_input(self, ident_expr(&input_ident), &arm)?;
            expression = cond_expr(
                arm_test(self, ident_expr(&input_ident), &arm)?,
                handler_result(arm.handler, handler_input),
                expression,
            );
        }

        Some(iife(vec![
            const_stmt(input_ident, *chain.input),
            return_stmt(expression),
        ]))
    }

    fn exhaustive_error_callee(&mut self) -> Expr {
        match &self.non_exhaustive_error {
            Some(callee) => callee.clone(),
            None => {
                self.needs_non_exhaustive_error_import = true;
                Expr::Ident(quote_ident!("NonExhaustiveError").into())
            }
        }
    }

    fn pattern_test(&self, value: Expr, pattern: &Expr) -> Option<Expr> {
        let mut selections = Vec::new();
        self.pattern_test_with_selections(value, pattern, &mut selections)
    }

    fn pattern_test_with_selections(
        &self,
        value: Expr,
        pattern: &Expr,
        selections: &mut Vec<SelectionBinding>,
    ) -> Option<Expr> {
        if let Some(call) = self.is_p_call(pattern, "select") {
            return match call.args.as_slice() {
                [] => {
                    selections.push(SelectionBinding { name: None, value });
                    Some(bool_lit(true))
                }
                [arg] => {
                    if let Some(name) = selection_name(&arg.expr) {
                        selections.push(SelectionBinding {
                            name: Some(name),
                            value,
                        });
                        Some(bool_lit(true))
                    } else {
                        selections.push(SelectionBinding {
                            name: None,
                            value: value.clone(),
                        });
                        self.pattern_test_with_selections(value, &arg.expr, selections)
                    }
                }
                [name, inner] => {
                    selections.push(SelectionBinding {
                        name: Some(selection_name(&name.expr)?),
                        value: value.clone(),
                    });
                    self.pattern_test_with_selections(value, &inner.expr, selections)
                }
                _ => None,
            };
        }

        if self.is_p_member(pattern, "_") {
            return Some(bool_lit(true));
        }

        for (name, type_name) in [
            ("string", "string"),
            ("number", "number"),
            ("boolean", "boolean"),
            ("bigint", "bigint"),
            ("symbol", "symbol"),
        ] {
            if self.is_p_member(pattern, name) {
                return Some(typeof_eq(value, type_name));
            }
        }

        if self.is_p_member(pattern, "nullish") {
            return Some(or(
                strict_eq(value.clone(), null_lit()),
                strict_eq(value, undefined_expr()),
            ));
        }

        if self.is_p_member(pattern, "nonNullable") {
            return Some(and(
                strict_ne(value.clone(), null_lit()),
                strict_ne(value, undefined_expr()),
            ));
        }

        if let Some(call) = self.is_p_call(pattern, "optional") {
            if call.args.len() != 1 {
                return None;
            }
            return Some(or(
                strict_eq(value.clone(), undefined_expr()),
                self.pattern_test_with_selections(value, &call.args[0].expr, selections)?,
            ));
        }

        if let Some(call) = self.is_p_call(pattern, "not") {
            if call.args.len() != 1 {
                return None;
            }
            let mut inner_selections = Vec::new();
            let test = self.pattern_test_with_selections(
                value,
                &call.args[0].expr,
                &mut inner_selections,
            )?;
            if !inner_selections.is_empty() {
                return None;
            }
            return Some(unary(UnaryOp::Bang, test));
        }

        if let Some(call) = self.is_p_call(pattern, "union") {
            if call.args.is_empty() {
                return None;
            }

            return call
                .args
                .iter()
                .map(|arg| {
                    let mut inner_selections = Vec::new();
                    let test = self.pattern_test_with_selections(
                        value.clone(),
                        &arg.expr,
                        &mut inner_selections,
                    )?;
                    if !inner_selections.is_empty() {
                        return None;
                    }
                    Some(test)
                })
                .try_fold(None, |acc, test| {
                    let test = test?;
                    Some(Some(match acc {
                        Some(acc) => or(acc, test),
                        None => test,
                    }))
                })?;
        }

        if let Some(call) = self.is_p_call(pattern, "array") {
            if call.args.len() > 1 {
                return None;
            }

            let array_test = array_is_array(value.clone());
            if call.args.is_empty() {
                return Some(array_test);
            }

            let item_ident = private_ident!("_tsPatternItem");
            let mut item_selections = Vec::new();
            let item_test = self.pattern_test_with_selections(
                ident_expr(&item_ident),
                &call.args[0].expr,
                &mut item_selections,
            )?;
            if !item_selections.is_empty() {
                return None;
            }
            return Some(and(
                array_test,
                call_member(
                    member_expr(value, "every"),
                    vec![Expr::Arrow(ArrowExpr {
                        span: DUMMY_SP,
                        ctxt: Default::default(),
                        params: vec![Pat::Ident(item_ident.into())],
                        body: Box::new(BlockStmtOrExpr::Expr(Box::new(item_test))),
                        is_async: false,
                        is_generator: false,
                        type_params: None,
                        return_type: None,
                    })],
                ),
            ));
        }

        if let Some(call) = self.is_p_call(pattern, "instanceOf") {
            if call.args.len() != 1 {
                return None;
            }
            return Some(Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::InstanceOf,
                left: Box::new(value),
                right: call.args[0].expr.clone(),
            }));
        }

        if let Some(call) = self.is_p_call(pattern, "when") {
            if call.args.len() != 1 {
                return None;
            }
            return Some(call_expr((*call.args[0].expr).clone(), vec![value]));
        }

        match pattern {
            Expr::Lit(Lit::Str(_))
            | Expr::Lit(Lit::Num(_))
            | Expr::Lit(Lit::Bool(_))
            | Expr::Lit(Lit::BigInt(_))
            | Expr::Lit(Lit::Null(_)) => Some(strict_eq(value, pattern.clone())),
            Expr::Ident(ident) if ident.sym.as_ref() == "undefined" => {
                Some(strict_eq(value, undefined_expr()))
            }
            Expr::Tpl(tpl) if tpl.exprs.is_empty() && tpl.quasis.len() == 1 => {
                Some(strict_eq(value, pattern.clone()))
            }
            Expr::Unary(unary_expr)
                if unary_expr.op == UnaryOp::Minus && is_number_literal(&unary_expr.arg) =>
            {
                Some(strict_eq(value, pattern.clone()))
            }
            Expr::Object(object) => self.object_test(value, object, selections),
            Expr::Array(array) => self.array_test(value, array, selections),
            _ => None,
        }
    }

    fn object_test(
        &self,
        value: Expr,
        object: &ObjectLit,
        selections: &mut Vec<SelectionBinding>,
    ) -> Option<Expr> {
        let base = and(
            strict_ne(value.clone(), null_lit()),
            typeof_eq(value.clone(), "object"),
        );

        object.props.iter().try_fold(base, |acc, prop| {
            let PropOrSpread::Prop(prop) = prop else {
                return None;
            };

            let Prop::KeyValue(key_value) = &**prop else {
                return None;
            };

            let prop_access = prop_access(value.clone(), &key_value.key)?;
            let test =
                self.pattern_test_with_selections(prop_access, &key_value.value, selections)?;
            let test = if self.is_optional_pattern(&key_value.value) {
                test
            } else {
                and(prop_in_object(&key_value.key, value.clone())?, test)
            };
            Some(and(acc, test))
        })
    }

    fn is_optional_pattern(&self, pattern: &Expr) -> bool {
        self.is_p_call(pattern, "optional").is_some()
    }

    fn array_test(
        &self,
        value: Expr,
        array: &ArrayLit,
        selections: &mut Vec<SelectionBinding>,
    ) -> Option<Expr> {
        let len = array.elems.len();
        let base = and(
            array_is_array(value.clone()),
            strict_eq(
                member_expr(value.clone(), "length"),
                Expr::Lit(Lit::Num(Number {
                    span: DUMMY_SP,
                    value: len as f64,
                    raw: None,
                })),
            ),
        );

        array
            .elems
            .iter()
            .enumerate()
            .try_fold(base, |acc, (index, elem)| {
                let elem = elem.as_ref()?;
                if elem.spread.is_some() {
                    return None;
                }

                let item = computed_member_expr(
                    value.clone(),
                    Expr::Lit(Lit::Num(Number {
                        span: DUMMY_SP,
                        value: index as f64,
                        raw: None,
                    })),
                );
                let test = self.pattern_test_with_selections(item, &elem.expr, selections)?;
                Some(and(acc, test))
            })
    }
}

fn module_export_name(name: &ModuleExportName) -> String {
    match name {
        ModuleExportName::Ident(ident) => ident.sym.to_string(),
        ModuleExportName::Str(str) => str.value.to_string_lossy().to_string(),
    }
}

fn is_ts_pattern_import(source: &str) -> bool {
    source == "ts-pattern" || source.starts_with("npm:ts-pattern")
}

fn add_non_exhaustive_error_import(module: &mut Module) {
    let specifier = || {
        ImportSpecifier::Named(ImportNamedSpecifier {
            span: DUMMY_SP,
            local: quote_ident!("NonExhaustiveError").into(),
            imported: None,
            is_type_only: false,
        })
    };

    for item in &mut module.body {
        let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item else {
            continue;
        };

        if !import.type_only && is_ts_pattern_import(&import.src.value.to_string_lossy()) {
            import.specifiers.push(specifier());
            return;
        }
    }

    module.body.insert(
        0,
        ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
            span: DUMMY_SP,
            specifiers: vec![specifier()],
            src: Box::new(Str {
                span: DUMMY_SP,
                value: "ts-pattern".into(),
                raw: None,
            }),
            type_only: false,
            with: None,
            phase: Default::default(),
        })),
    );
}

fn parse_with_arm(call: &CallExpr) -> Option<MatchArm> {
    if call.args.len() < 2 {
        return None;
    }

    let mut args = call
        .args
        .iter()
        .map(|arg| arg.expr.clone())
        .collect::<Vec<_>>();
    let handler = args.pop()?;
    let guard = if args.len() >= 2 && is_function_expr(args.last()?) {
        args.pop()
    } else {
        None
    };

    Some(MatchArm {
        patterns: args,
        guard,
        handler,
    })
}

fn parse_when_arm(call: &CallExpr) -> Option<MatchArm> {
    if call.args.len() != 2 {
        return None;
    }

    Some(MatchArm {
        patterns: vec![Box::new(Expr::Invalid(Invalid { span: DUMMY_SP }))],
        guard: Some(call.args[0].expr.clone()),
        handler: call.args[1].expr.clone(),
    })
}

fn arm_test(transformer: &TsPatternTransformer, input: Expr, arm: &MatchArm) -> Option<Expr> {
    let pattern_test = if arm.patterns.len() == 1 && matches!(*arm.patterns[0], Expr::Invalid(_)) {
        bool_lit(true)
    } else {
        arm.patterns
            .iter()
            .map(|pattern| transformer.pattern_test(input.clone(), pattern))
            .try_fold(None, |acc, test| {
                let test = test?;
                Some(Some(match acc {
                    Some(acc) => or(acc, test),
                    None => test,
                }))
            })??
    };

    match &arm.guard {
        Some(guard) => Some(and(pattern_test, guard_result(guard, input))),
        None => Some(pattern_test),
    }
}

fn arm_handler_input(
    transformer: &TsPatternTransformer,
    input_expr: Expr,
    arm: &MatchArm,
) -> Option<Expr> {
    let mut selections = Vec::new();

    for pattern in &arm.patterns {
        transformer.pattern_test_with_selections(input_expr.clone(), pattern, &mut selections)?;
    }

    if selections.is_empty() {
        return Some(input_expr);
    }

    if arm.patterns.len() != 1 {
        return None;
    }

    let anonymous_count = selections
        .iter()
        .filter(|selection| selection.name.is_none())
        .count();
    if anonymous_count > 1 || (anonymous_count == 1 && selections.len() > 1) {
        return None;
    }

    if anonymous_count == 1 {
        return selections
            .into_iter()
            .find_map(|selection| selection.name.is_none().then_some(selection.value));
    }

    Some(named_selection_object(selections))
}

fn named_selection_object(selections: Vec<SelectionBinding>) -> Expr {
    Expr::Object(ObjectLit {
        span: DUMMY_SP,
        props: selections
            .into_iter()
            .map(|selection| {
                PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Ident(IdentName::new(
                        selection.name.expect("named selection").into(),
                        DUMMY_SP,
                    )),
                    value: Box::new(selection.value),
                })))
            })
            .collect(),
    })
}

fn selection_name(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Lit(Lit::Str(str)) => Some(str.value.to_string_lossy().to_string()),
        Expr::Tpl(tpl) if tpl.exprs.is_empty() && tpl.quasis.len() == 1 => {
            Some(tpl.quasis[0].raw.to_string())
        }
        _ => None,
    }
}

fn guard_result(guard: &Expr, input_expr: Expr) -> Expr {
    match guard {
        Expr::Arrow(ArrowExpr {
            params,
            body,
            is_async: false,
            is_generator: false,
            ..
        }) if params.len() == 1 => {
            if let BlockStmtOrExpr::Expr(expr) = &**body {
                if let Some(inlined) =
                    inline_simple_lambda_body(&params[0], input_expr.clone(), (**expr).clone())
                {
                    return inlined;
                }
            }

            call_expr(guard.clone(), vec![input_expr])
        }
        _ => call_expr(guard.clone(), vec![input_expr]),
    }
}

fn can_inline_input(expr: &Expr) -> bool {
    matches!(expr, Expr::Ident(_) | Expr::Lit(_))
}

fn is_switchable_arm(arm: &MatchArm) -> bool {
    arm.guard.is_none()
        && arm
            .patterns
            .iter()
            .all(|pattern| is_switch_literal(pattern))
}

fn is_switch_literal(expr: &Expr) -> bool {
    matches!(
        expr,
        Expr::Lit(Lit::Str(_))
            | Expr::Lit(Lit::Num(_))
            | Expr::Lit(Lit::Bool(_))
            | Expr::Lit(Lit::BigInt(_))
            | Expr::Lit(Lit::Null(_))
    ) || matches!(expr, Expr::Unary(unary) if unary.op == UnaryOp::Minus && is_number_literal(&unary.arg))
}

fn is_number_literal(expr: &Expr) -> bool {
    matches!(expr, Expr::Lit(Lit::Num(_)))
}

fn is_function_expr(expr: &Expr) -> bool {
    matches!(expr, Expr::Arrow(_) | Expr::Fn(_))
}

fn as_call(expr: &Expr) -> Option<&CallExpr> {
    match expr {
        Expr::Call(call) => Some(call),
        _ => None,
    }
}

fn as_method_call(call: &CallExpr) -> Option<(String, &Expr)> {
    let Callee::Expr(callee) = &call.callee else {
        return None;
    };
    let Expr::Member(member) = &**callee else {
        return None;
    };

    Some((member_name(member)?.to_string(), &member.obj))
}

fn member_name(member: &MemberExpr) -> Option<&str> {
    match &member.prop {
        MemberProp::Ident(ident) => Some(ident.sym.as_ref()),
        MemberProp::PrivateName(_) => None,
        MemberProp::Computed(_) => None,
    }
}

fn prop_access(value: Expr, key: &PropName) -> Option<Expr> {
    match key {
        PropName::Ident(ident) => Some(member_expr(value, ident.sym.as_ref())),
        PropName::Str(str) => Some(computed_member_expr(
            value,
            Expr::Lit(Lit::Str(str.clone())),
        )),
        PropName::Num(num) => Some(computed_member_expr(
            value,
            Expr::Lit(Lit::Num(num.clone())),
        )),
        PropName::BigInt(bigint) => Some(computed_member_expr(
            value,
            Expr::Lit(Lit::BigInt(bigint.clone())),
        )),
        PropName::Computed(computed) => Some(computed_member_expr(value, (*computed.expr).clone())),
    }
}

fn iife(stmts: Vec<Stmt>) -> Expr {
    call_expr(
        Expr::Paren(ParenExpr {
            span: DUMMY_SP,
            expr: Box::new(Expr::Arrow(ArrowExpr {
                span: DUMMY_SP,
                ctxt: Default::default(),
                params: Vec::new(),
                body: Box::new(BlockStmtOrExpr::BlockStmt(BlockStmt {
                    span: DUMMY_SP,
                    ctxt: Default::default(),
                    stmts,
                })),
                is_async: false,
                is_generator: false,
                type_params: None,
                return_type: None,
            })),
        }),
        Vec::new(),
    )
}

fn const_stmt(ident: Ident, init: Expr) -> Stmt {
    Stmt::Decl(Decl::Var(Box::new(VarDecl {
        span: DUMMY_SP,
        ctxt: Default::default(),
        kind: VarDeclKind::Const,
        declare: false,
        decls: vec![VarDeclarator {
            span: DUMMY_SP,
            name: Pat::Ident(ident.into()),
            init: Some(Box::new(init)),
            definite: false,
        }],
    })))
}

fn fallback_stmts(
    fallback: Fallback,
    input_expr: Expr,
    exhaustive_error_callee: Option<Expr>,
) -> Vec<Stmt> {
    match fallback {
        Fallback::Otherwise(handler) => vec![return_stmt(handler_result(handler, input_expr))],
        Fallback::Exhaustive => vec![throw_exhaustive_stmt(
            exhaustive_error_callee.expect("exhaustive error callee"),
            input_expr,
        )],
    }
}

fn fallback_expr(
    fallback: Fallback,
    input_expr: Expr,
    exhaustive_error_callee: Option<Expr>,
) -> Expr {
    match fallback {
        Fallback::Otherwise(handler) => handler_result(handler, input_expr),
        Fallback::Exhaustive => iife(vec![throw_exhaustive_stmt(
            exhaustive_error_callee.expect("exhaustive error callee"),
            input_expr,
        )]),
    }
}

fn throw_exhaustive_stmt(callee: Expr, input_expr: Expr) -> Stmt {
    Stmt::Throw(ThrowStmt {
        span: DUMMY_SP,
        arg: Box::new(Expr::New(NewExpr {
            span: DUMMY_SP,
            ctxt: Default::default(),
            callee: Box::new(callee),
            args: Some(vec![ExprOrSpread {
                spread: None,
                expr: Box::new(input_expr),
            }]),
            type_args: None,
        })),
    })
}

fn return_stmt(expr: Expr) -> Stmt {
    Stmt::Return(ReturnStmt {
        span: DUMMY_SP,
        arg: Some(Box::new(expr)),
    })
}

fn handler_result(handler: Box<Expr>, input_expr: Expr) -> Expr {
    match *handler {
        Expr::Arrow(ArrowExpr {
            params,
            body,
            is_async: false,
            is_generator: false,
            ..
        }) if params.is_empty() => match *body {
            BlockStmtOrExpr::Expr(expr) => *expr,
            BlockStmtOrExpr::BlockStmt(block) => call_handler(
                Box::new(Expr::Arrow(ArrowExpr {
                    span: DUMMY_SP,
                    ctxt: Default::default(),
                    params,
                    body: Box::new(BlockStmtOrExpr::BlockStmt(block)),
                    is_async: false,
                    is_generator: false,
                    type_params: None,
                    return_type: None,
                })),
                input_expr,
            ),
        },
        Expr::Arrow(ArrowExpr {
            params,
            body,
            is_async: false,
            is_generator: false,
            ..
        }) if params.len() == 1 => match *body {
            BlockStmtOrExpr::Expr(expr) => {
                if let Some(inlined) =
                    inline_simple_handler_body(&params[0], input_expr.clone(), *expr.clone())
                {
                    return inlined;
                }

                call_handler(
                    Box::new(Expr::Arrow(ArrowExpr {
                        span: DUMMY_SP,
                        ctxt: Default::default(),
                        params,
                        body: Box::new(BlockStmtOrExpr::Expr(expr)),
                        is_async: false,
                        is_generator: false,
                        type_params: None,
                        return_type: None,
                    })),
                    input_expr,
                )
            }
            BlockStmtOrExpr::BlockStmt(block) => call_handler(
                Box::new(Expr::Arrow(ArrowExpr {
                    span: DUMMY_SP,
                    ctxt: Default::default(),
                    params,
                    body: Box::new(BlockStmtOrExpr::BlockStmt(block)),
                    is_async: false,
                    is_generator: false,
                    type_params: None,
                    return_type: None,
                })),
                input_expr,
            ),
        },
        handler => call_handler(Box::new(handler), input_expr),
    }
}

fn inline_simple_handler_body(param: &Pat, input_expr: Expr, body: Expr) -> Option<Expr> {
    inline_simple_lambda_body(param, input_expr, body)
}

fn inline_simple_lambda_body(param: &Pat, input_expr: Expr, mut body: Expr) -> Option<Expr> {
    let mut bindings = Vec::new();
    collect_pat_bindings(param, input_expr, &mut bindings)?;
    if !is_simple_inline_body(&body, &bindings) {
        return None;
    }
    body.visit_mut_with(&mut InlineBindings { bindings });
    Some(body)
}

fn collect_pat_bindings(param: &Pat, value: Expr, bindings: &mut Vec<(Id, Expr)>) -> Option<()> {
    match param {
        Pat::Ident(ident) => {
            bindings.push((ident.id.to_id(), value));
            Some(())
        }
        Pat::Object(object) => object.props.iter().try_for_each(|prop| match prop {
            ObjectPatProp::Assign(assign) if assign.value.is_none() => {
                bindings.push((
                    assign.key.id.to_id(),
                    member_expr(value.clone(), assign.key.id.sym.as_ref()),
                ));
                Some(())
            }
            ObjectPatProp::KeyValue(key_value) => collect_pat_bindings(
                &key_value.value,
                prop_access(value.clone(), &key_value.key)?,
                bindings,
            ),
            ObjectPatProp::Assign(_) | ObjectPatProp::Rest(_) => None,
        }),
        Pat::Array(array) => array
            .elems
            .iter()
            .enumerate()
            .try_for_each(|(index, elem)| {
                if let Some(elem) = elem {
                    collect_pat_bindings(
                        elem,
                        computed_member_expr(
                            value.clone(),
                            Expr::Lit(Lit::Num(Number {
                                span: DUMMY_SP,
                                value: index as f64,
                                raw: None,
                            })),
                        ),
                        bindings,
                    )
                } else {
                    Some(())
                }
            }),
        Pat::Assign(_) | Pat::Rest(_) | Pat::Invalid(_) | Pat::Expr(_) => None,
    }
}

fn is_simple_inline_body(body: &Expr, bindings: &[(Id, Expr)]) -> bool {
    let mut usage = BindingUsage {
        bindings: bindings.iter().map(|(id, _)| id.clone()).collect(),
        counts: vec![0; bindings.len()],
        has_mutation: false,
    };
    let mut body = body.clone();
    body.visit_mut_with(&mut usage);
    !usage.has_mutation && usage.counts.iter().all(|count| *count == 1)
}

struct BindingUsage {
    bindings: Vec<Id>,
    counts: Vec<usize>,
    has_mutation: bool,
}

impl VisitMut for BindingUsage {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        match expr {
            Expr::Ident(ident) => {
                if let Some(index) = self.bindings.iter().position(|id| *id == ident.to_id()) {
                    self.counts[index] += 1;
                }
            }
            Expr::Assign(_) | Expr::Update(_) => {
                self.has_mutation = true;
            }
            Expr::Arrow(_) | Expr::Fn(_) | Expr::Class(_) => return,
            _ => {}
        }

        expr.visit_mut_children_with(self);
    }
}

struct InlineBindings {
    bindings: Vec<(Id, Expr)>,
}

impl VisitMut for InlineBindings {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        if let Expr::Ident(ident) = expr {
            if let Some((_, replacement)) =
                self.bindings.iter().find(|(id, _)| *id == ident.to_id())
            {
                *expr = replacement.clone();
                return;
            }
        }

        match expr {
            Expr::Arrow(_) | Expr::Fn(_) | Expr::Class(_) => {}
            _ => expr.visit_mut_children_with(self),
        }
    }
}

fn call_handler(handler: Box<Expr>, input_expr: Expr) -> Expr {
    call_expr(
        Expr::Paren(ParenExpr {
            span: DUMMY_SP,
            expr: handler,
        }),
        vec![input_expr],
    )
}

fn call_expr(callee: Expr, args: Vec<Expr>) -> Expr {
    Expr::Call(CallExpr {
        span: DUMMY_SP,
        ctxt: Default::default(),
        callee: Callee::Expr(Box::new(callee)),
        args: args
            .into_iter()
            .map(|expr| ExprOrSpread {
                spread: None,
                expr: Box::new(expr),
            })
            .collect(),
        type_args: None,
    })
}

fn call_member(member: Expr, args: Vec<Expr>) -> Expr {
    call_expr(member, args)
}

fn ident_expr(ident: &Ident) -> Expr {
    Expr::Ident(ident.clone())
}

fn member_expr(obj: Expr, prop: &str) -> Expr {
    Expr::Member(MemberExpr {
        span: DUMMY_SP,
        obj: Box::new(obj),
        prop: MemberProp::Ident(IdentName::new(prop.into(), DUMMY_SP)),
    })
}

fn computed_member_expr(obj: Expr, prop: Expr) -> Expr {
    Expr::Member(MemberExpr {
        span: DUMMY_SP,
        obj: Box::new(obj),
        prop: MemberProp::Computed(ComputedPropName {
            span: DUMMY_SP,
            expr: Box::new(prop),
        }),
    })
}

fn prop_in_object(key: &PropName, obj: Expr) -> Option<Expr> {
    Some(bin(BinaryOp::In, prop_key_expr(key)?, obj))
}

fn prop_key_expr(key: &PropName) -> Option<Expr> {
    match key {
        PropName::Ident(ident) => Some(Expr::Lit(Lit::Str(Str {
            span: DUMMY_SP,
            value: ident.sym.clone().into(),
            raw: None,
        }))),
        PropName::Str(str) => Some(Expr::Lit(Lit::Str(str.clone()))),
        PropName::Num(num) => Some(Expr::Lit(Lit::Num(num.clone()))),
        PropName::BigInt(bigint) => Some(Expr::Lit(Lit::BigInt(bigint.clone()))),
        PropName::Computed(computed) => Some((*computed.expr).clone()),
    }
}

fn strict_eq(left: Expr, right: Expr) -> Expr {
    bin(BinaryOp::EqEqEq, left, right)
}

fn strict_ne(left: Expr, right: Expr) -> Expr {
    bin(BinaryOp::NotEqEq, left, right)
}

fn and(left: Expr, right: Expr) -> Expr {
    bin(BinaryOp::LogicalAnd, left, right)
}

fn or(left: Expr, right: Expr) -> Expr {
    bin(BinaryOp::LogicalOr, left, right)
}

fn cond_expr(test: Expr, consequent: Expr, alternate: Expr) -> Expr {
    Expr::Cond(CondExpr {
        span: DUMMY_SP,
        test: Box::new(test),
        cons: Box::new(consequent),
        alt: Box::new(alternate),
    })
}

fn bin(op: BinaryOp, left: Expr, right: Expr) -> Expr {
    Expr::Bin(BinExpr {
        span: DUMMY_SP,
        op,
        left: Box::new(left),
        right: Box::new(right),
    })
}

fn unary(op: UnaryOp, arg: Expr) -> Expr {
    Expr::Unary(UnaryExpr {
        span: DUMMY_SP,
        op,
        arg: Box::new(arg),
    })
}

fn bool_lit(value: bool) -> Expr {
    Expr::Lit(Lit::Bool(Bool {
        span: DUMMY_SP,
        value,
    }))
}

fn null_lit() -> Expr {
    Expr::Lit(Lit::Null(Null { span: DUMMY_SP }))
}

fn undefined_expr() -> Expr {
    Expr::Ident(quote_ident!("undefined").into())
}

fn typeof_eq(value: Expr, type_name: &str) -> Expr {
    strict_eq(
        unary(UnaryOp::TypeOf, value),
        Expr::Lit(Lit::Str(Str {
            span: DUMMY_SP,
            value: type_name.into(),
            raw: None,
        })),
    )
}

fn array_is_array(value: Expr) -> Expr {
    call_expr(
        member_expr(Expr::Ident(quote_ident!("Array").into()), "isArray"),
        vec![value],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use swc_core::{
        common::{FileName, Globals, SourceMap, GLOBALS},
        ecma::{
            codegen::{text_writer::JsWriter, Emitter},
            parser::{lexer::Lexer, Parser, StringInput, Syntax, TsSyntax},
            visit::VisitMutWith,
        },
    };

    fn transform(source: &str) -> String {
        GLOBALS.set(&Globals::new(), || {
            let cm: std::sync::Arc<SourceMap> = Default::default();
            let file = cm.new_source_file(FileName::Anon.into(), source.to_string());
            let lexer = Lexer::new(
                Syntax::Typescript(TsSyntax {
                    tsx: false,
                    decorators: false,
                    dts: false,
                    no_early_errors: false,
                    disallow_ambiguous_jsx_like: false,
                }),
                Default::default(),
                StringInput::from(&*file),
                None,
            );
            let mut parser = Parser::new_from(lexer);
            let mut module = parser.parse_module().unwrap();
            module.visit_mut_with(&mut TsPatternTransformer::default());

            let mut output = Vec::new();
            {
                let mut emitter = Emitter {
                    cfg: Default::default(),
                    cm: cm.clone(),
                    comments: None,
                    wr: JsWriter::new(cm, "\n", &mut output, None),
                };
                emitter.emit_module(&module).unwrap();
            }

            String::from_utf8(output).unwrap()
        })
    }

    #[test]
    fn emits_switch_for_literal_match() {
        let output = transform(
            r#"import { match } from "ts-pattern";
const result = match(input).with("a", () => 1).with("b", () => 2).otherwise(() => 0);"#,
        );

        assert!(output.contains("switch"), "{output}");
        assert!(output.contains("case \"a\""), "{output}");
        assert!(output.contains("default"), "{output}");
    }

    #[test]
    fn emits_switch_block_for_arrow_body_literal_match() {
        let output = transform(
            r#"import { match } from "ts-pattern";
export const run = (command: "start" | "stop" | "pause" | "unknown") => match(command).with("start", () => "running").with("stop", "pause", () => "halted").otherwise(() => "ignored");"#,
        );

        assert!(output.contains("=>{"), "{output}");
        assert!(output.contains("switch"), "{output}");
        assert!(!output.contains("=> (()=>"), "{output}");
    }

    #[test]
    fn emits_ternary_for_object_pattern() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with({ type: "ok", value: P.number }, (value) => value.value).otherwise(() => 0);"#,
        );

        assert!(output.contains("?"), "{output}");
        assert!(output.contains(":"), "{output}");
        assert!(output.contains("typeof"), "{output}");
        assert!(output.contains("value === \"number\""), "{output}");
    }

    #[test]
    fn inlines_safe_input_ternary() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(value).with(P.union(P.string, P.number), () => "scalar").with(P.boolean, () => "flag").otherwise(() => "empty");"#,
        );

        assert!(!output.contains("_tsPatternInput"), "{output}");
        assert!(!output.contains("(() => \"scalar\")("), "{output}");
        assert!(output.contains("typeof value === \"string\""), "{output}");
        assert!(output.contains("? \"scalar\""), "{output}");
    }

    #[test]
    fn inlines_simple_destructured_guard() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(item).with({ count: P.number }, ({ count }) => count > 5, () => "many").with({ count: P.number }, () => "some").otherwise(() => "none");"#,
        );

        assert!(output.contains("item.count > 5"), "{output}");
        assert!(!output.contains("count })=>count > 5)(item)"), "{output}");
    }

    #[test]
    fn inlines_simple_destructured_handler() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with({ type: "ok", value: P.number }, ({ value }) => `ok:${value}`).otherwise(() => "idle");"#,
        );

        assert!(output.contains("`ok:${input.value}`"), "{output}");
        assert!(!output.contains("=> `ok:"), "{output}");
    }

    #[test]
    fn requires_object_key_for_wildcard_property() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with({ storeId: P._ }, () => "store").with({ teamId: P._ }, () => "team").exhaustive();"#,
        );

        assert!(
            output.contains("\"storeId\" in _tsPatternInput"),
            "{output}"
        );
        assert!(output.contains("\"teamId\" in _tsPatternInput"), "{output}");
    }

    #[test]
    fn requires_object_key_for_undefined_property() {
        let output = transform(
            r#"import { match } from "ts-pattern";
const result = match(input).with({ type: undefined }, () => true).exhaustive();"#,
        );

        assert!(output.contains("\"type\" in _tsPatternInput"), "{output}");
        assert!(
            output.contains("_tsPatternInput.type === undefined"),
            "{output}"
        );
    }

    #[test]
    fn throws_ts_pattern_non_exhaustive_error() {
        let output = transform(
            r#"import { match } from "ts-pattern";
const result = match(input).with("ok", () => true).exhaustive();"#,
        );

        assert!(output.contains("NonExhaustiveError"), "{output}");
        assert!(
            output.contains("throw new NonExhaustiveError(_tsPatternInput)"),
            "{output}"
        );
    }

    #[test]
    fn supports_deno_npm_ts_pattern_imports() {
        let output = transform(
            r#"import { match } from "npm:ts-pattern";
const result = match(input).with("ok", () => true).otherwise(() => false);"#,
        );

        assert!(output.contains("switch"), "{output}");
        assert!(output.contains("case \"ok\""), "{output}");
    }

    #[test]
    fn supports_select_handlers() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with(P.select(), (value) => value).otherwise(() => 0);"#,
        );

        assert!(!output.contains("match(input).with"), "{output}");
        assert!(output.contains("? input : 0"), "{output}");
    }

    #[test]
    fn supports_nested_select_handlers() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with({ type: "ok", data: { type: "img", src: P.select() } }, (src) => `<img src="${src}" />`).otherwise(() => "?");"#,
        );

        assert!(!output.contains("match(input).with"), "{output}");
        assert!(output.contains("input.data.src"), "{output}");
        assert!(
            output.contains("<img src=\"${input.data.src}\" />"),
            "{output}"
        );
    }

    #[test]
    fn keeps_unsupported_array_select_pattern_unchanged() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with(P.array(P.select()), (value) => value).otherwise(() => []);"#,
        );

        assert!(output.contains("match(input).with"), "{output}");
    }
}
