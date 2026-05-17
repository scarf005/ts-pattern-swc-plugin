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

impl VisitMut for TsPatternTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.collect_imports(module);
        module.visit_mut_children_with(self);
    }

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);

        if let Some(chain) = self.parse_match_chain(expr) {
            if let Some(compiled) = self.compile_chain(chain) {
                *expr = compiled;
            }
        }
    }
}

impl TsPatternTransformer {
    fn collect_imports(&mut self, module: &Module) {
        for item in &module.body {
            let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item else {
                continue;
            };

            if &*import.src.value != "ts-pattern" {
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
                            _ => {}
                        }
                    }
                    ImportSpecifier::Namespace(namespace) => {
                        self.namespaces.insert(namespace.local.to_id());
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

    fn compile_chain(&self, chain: MatchChain) -> Option<Expr> {
        if chain.arms.iter().all(is_switchable_arm) {
            Some(self.compile_switch(chain))
        } else {
            self.compile_if_chain(chain)
        }
    }

    fn compile_switch(&self, chain: MatchChain) -> Expr {
        let input_ident = private_ident!("_tsPatternInput");
        let input_expr = ident_expr(&input_ident);
        let mut cases = Vec::new();

        for arm in chain.arms {
            let handler_call = call_handler(arm.handler, input_expr.clone());
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

        cases.push(SwitchCase {
            span: DUMMY_SP,
            test: None,
            cons: fallback_stmts(chain.fallback, input_expr),
        });

        iife(vec![
            const_stmt(input_ident.clone(), *chain.input),
            Stmt::Switch(SwitchStmt {
                span: DUMMY_SP,
                discriminant: Box::new(ident_expr(&input_ident)),
                cases,
            }),
        ])
    }

    fn compile_if_chain(&self, chain: MatchChain) -> Option<Expr> {
        let input_ident = private_ident!("_tsPatternInput");
        let mut expression = fallback_expr(chain.fallback, ident_expr(&input_ident));

        for arm in chain.arms.into_iter().rev() {
            expression = cond_expr(
                arm_test(self, &input_ident, &arm)?,
                call_handler(arm.handler, ident_expr(&input_ident)),
                expression,
            );
        }

        Some(iife(vec![
            const_stmt(input_ident, *chain.input),
            return_stmt(expression),
        ]))
    }

    fn pattern_test(&self, value: Expr, pattern: &Expr) -> Option<Expr> {
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
                self.pattern_test(value, &call.args[0].expr)?,
            ));
        }

        if let Some(call) = self.is_p_call(pattern, "not") {
            if call.args.len() != 1 {
                return None;
            }
            return Some(unary(
                UnaryOp::Bang,
                self.pattern_test(value, &call.args[0].expr)?,
            ));
        }

        if let Some(call) = self.is_p_call(pattern, "union") {
            if call.args.is_empty() {
                return None;
            }

            return call
                .args
                .iter()
                .map(|arg| self.pattern_test(value.clone(), &arg.expr))
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
            let item_test = self.pattern_test(ident_expr(&item_ident), &call.args[0].expr)?;
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
            Expr::Object(object) => self.object_test(value, object),
            Expr::Array(array) => self.array_test(value, array),
            _ => None,
        }
    }

    fn object_test(&self, value: Expr, object: &ObjectLit) -> Option<Expr> {
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
            let test = self.pattern_test(prop_access, &key_value.value)?;
            Some(and(acc, test))
        })
    }

    fn array_test(&self, value: Expr, array: &ArrayLit) -> Option<Expr> {
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
                let test = self.pattern_test(item, &elem.expr)?;
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

fn arm_test(
    transformer: &TsPatternTransformer,
    input_ident: &Ident,
    arm: &MatchArm,
) -> Option<Expr> {
    let pattern_test = if arm.patterns.len() == 1 && matches!(*arm.patterns[0], Expr::Invalid(_)) {
        bool_lit(true)
    } else {
        arm.patterns
            .iter()
            .map(|pattern| transformer.pattern_test(ident_expr(input_ident), pattern))
            .try_fold(None, |acc, test| {
                let test = test?;
                Some(Some(match acc {
                    Some(acc) => or(acc, test),
                    None => test,
                }))
            })??
    };

    match &arm.guard {
        Some(guard) => Some(and(
            pattern_test,
            call_expr((**guard).clone(), vec![ident_expr(input_ident)]),
        )),
        None => Some(pattern_test),
    }
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

fn fallback_stmts(fallback: Fallback, input_expr: Expr) -> Vec<Stmt> {
    match fallback {
        Fallback::Otherwise(handler) => vec![return_stmt(call_handler(handler, input_expr))],
        Fallback::Exhaustive => vec![throw_exhaustive_stmt()],
    }
}

fn fallback_expr(fallback: Fallback, input_expr: Expr) -> Expr {
    match fallback {
        Fallback::Otherwise(handler) => call_handler(handler, input_expr),
        Fallback::Exhaustive => iife(vec![throw_exhaustive_stmt()]),
    }
}

fn throw_exhaustive_stmt() -> Stmt {
    Stmt::Throw(ThrowStmt {
        span: DUMMY_SP,
        arg: Box::new(Expr::New(NewExpr {
            span: DUMMY_SP,
            ctxt: Default::default(),
            callee: Box::new(Expr::Ident(quote_ident!("Error").into())),
            args: Some(vec![ExprOrSpread {
                spread: None,
                expr: Box::new(Expr::Lit(Lit::Str(Str {
                    span: DUMMY_SP,
                    value: "Non-exhaustive ts-pattern match".into(),
                    raw: None,
                }))),
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
    fn keeps_unsupported_pattern_unchanged() {
        let output = transform(
            r#"import { match, P } from "ts-pattern";
const result = match(input).with(P.select("value"), (value) => value).otherwise(() => 0);"#,
        );

        assert!(output.contains("match(input).with"), "{output}");
    }
}
