import { jsx as _jsx } from "react/jsx-runtime";
import { match, P, NonExhaustiveError } from 'ts-pattern';
import { textForHtml } from './types';
export const renderWithTsPatternSwc = (result)=>{
    let html;
    if (!(result !== null && typeof result === "object" && "type" in result)) throw new NonExhaustiveError(result);
    else switch(result.type){
        case 'error':
            html = /*#__PURE__*/ _jsx("p", {
                children: "Oups! An error occured"
            });
            break;
        case 'ok':
            const _tsPatternData = result.data;
            if (!(_tsPatternData !== null && typeof _tsPatternData === "object" && "type" in _tsPatternData)) throw new NonExhaustiveError(result);
            else switch(_tsPatternData.type){
                case 'text':
                    html = /*#__PURE__*/ _jsx("p", {
                        children: result.data.content
                    });
                    break;
                case 'img':
                    if ("src" in _tsPatternData) html = /*#__PURE__*/ _jsx("img", {
                        src: _tsPatternData.src
                    });
                    else throw new NonExhaustiveError(result);
                    break;
                default:
                    throw new NonExhaustiveError(result);
                    break;
            }
            break;
        default:
            throw new NonExhaustiveError(result);
            break;
    }
    return {
        html,
        text: textForHtml(html)
    };
};
