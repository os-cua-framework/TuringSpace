"""Tool schemas and tool-call parsing for the Kimi K3 agent."""

from __future__ import annotations

import ast
import copy
import json
import re
from typing import Any, Sequence

from loguru import logger


TAKE_SCREENSHOT_TOOL = {
    "type": "function",
    "function": {
        "name": "take_screenshot",
        "description": "Take a screenshot of the current screen state.",
        "parameters": {
            "type": "object",
            "properties": {
                "screen_id": {
                    "type": "string",
                    "description": (
                        "The screen to capture. Defaults to ':0' if not specified."
                    ),
                },
            },
            "required": [],
        },
    },
}


COMPUTER_TOOL = {
    "type": "function",
    "function": {
        "name": "computer",
        "description": (
            "Perform a computer-level lifecycle action. Use wait to pause "
            "for loading, or terminate to end the task and report status."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["wait", "terminate"],
                    "description": "Lifecycle action to perform.",
                },
                "status": {
                    "type": "string",
                    "enum": ["success", "failure"],
                    "description": "Required for terminate; task status.",
                },
                "answer": {
                    "type": "string",
                    "description": "Optional final answer for terminate.",
                },
            },
            "required": ["action"],
        },
    },
}


PYAUTOGUI_TOOL_KIMI = {
    "type": "function",
    "function": {
        "name": "execute_pyautogui_code",
        "description": (
            "Execute a python code with pyautogui imported and ready to run "
            "to interact with the computer's GUI."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": (
                        "The python code, e.g. `pyautogui.click(x=100, y=200)`."
                    ),
                },
                "screen_id": {
                    "type": "string",
                    "description": (
                        "The screen to interact with. Defaults to ':0' if not "
                        "specified."
                    ),
                },
            },
            "required": ["code"],
        },
    },
}


WAIT_FOR_STATE_TOOL = {
    "type": "function",
    "function": {
        "name": "wait_for_state",
        "description": (
            "Wait briefly for a page, application, dialog, installation, or "
            "background operation to change state. This tool does not click, "
            "type, scroll, open, or close anything."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "seconds": {
                    "type": "integer",
                    "description": "Number of seconds to wait (1-60).",
                    "minimum": 1,
                    "maximum": 60,
                    "default": 20,
                },
                "reason": {
                    "type": "string",
                    "description": "Short description of the state being awaited.",
                },
            },
            "required": [],
        },
    },
}


FINISH_TASK_TOOL = {
    "type": "function",
    "function": {
        "name": "finish_task",
        "description": (
            "End the current task or phase. Use success only after every "
            "requested result is complete and verified; use failure only when "
            "the task is genuinely infeasible. This tool performs no GUI or "
            "shell action."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "failure"],
                    "description": "Whether the current task or phase completed.",
                },
                "answer": {
                    "type": "string",
                    "description": "Final answer, when the instruction asks for one.",
                },
            },
            "required": ["status"],
        },
    },
}


# The tools sent with every request, in their model-facing order.
KIMI_TOOLS = [
    TAKE_SCREENSHOT_TOOL,
    PYAUTOGUI_TOOL_KIMI,
    COMPUTER_TOOL,
    WAIT_FOR_STATE_TOOL,
    FINISH_TASK_TOOL,
]


class _InvalidToolArguments(dict):
    """Marker for arguments that were present but were not a JSON object."""

    def __init__(self, diagnostic: str) -> None:
        super().__init__()
        self.diagnostic = diagnostic


def extract_tool_fn(tool_call: dict) -> tuple[str, dict, str]:
    """Return ``(name, arguments_dict, id)`` of a tool call."""
    if not isinstance(tool_call, dict):
        tool_call = {}
    tool_call_id = tool_call.get("id", "")
    function = tool_call.get("function", {})
    if not isinstance(function, dict):
        function = {}
    name = function.get("name", "")
    raw_arguments = function.get("arguments", "")

    if isinstance(raw_arguments, str):
        try:
            arguments = json.loads(raw_arguments) if raw_arguments else {}
        except json.JSONDecodeError:
            logger.error(f"Failed to JSON-decode tool arguments: {raw_arguments!r}")
            arguments = _InvalidToolArguments("malformed JSON")
    else:
        arguments = raw_arguments
    if not isinstance(arguments, dict):
        logger.error(
            "Tool arguments for {!r} must decode to an object, got {}.",
            name,
            type(arguments).__name__,
        )
        arguments = _InvalidToolArguments(type(arguments).__name__)
    return name, arguments, tool_call_id


def parse_action_text(response_content: str) -> str:
    """The text following an ``## Action`` heading, or ''."""
    if not response_content:
        return ""
    input_string = response_content.lstrip()
    index = input_string.find("## Action")
    if index == -1:
        return ""
    action_match = re.search(
        r"^##\s*Action\s*:?[\n\r]+(.*?)(?=^##|\Z)",
        input_string[index:],
        re.DOTALL | re.MULTILINE,
    )
    return action_match.group(1).strip() if action_match else ""


def sanitize_tool_calls(tool_calls: Sequence[dict] | None) -> list[dict]:
    """Tool calls with only the standard fields and ``arguments`` as JSON text."""
    sanitized = []
    for tool_call in tool_calls or []:
        function = tool_call.get("function", {}) or {}
        raw_arguments = function.get("arguments", "")
        if not isinstance(raw_arguments, str):
            try:
                raw_arguments = json.dumps(raw_arguments or {})
            except (TypeError, ValueError):
                raw_arguments = "{}"
        sanitized.append(
            {
                "id": tool_call.get("id", "") or f"call_{len(sanitized)}",
                "type": "function",
                "function": {"name": function.get("name", ""), "arguments": raw_arguments},
            }
        )
    return sanitized


def canonicalize_tool_call(tool_call: dict) -> dict:
    """One tool call in replay form; the alias ``pyautogui`` becomes ``execute_pyautogui_code``."""
    name, arguments, tool_call_id = extract_tool_fn(tool_call)
    if name == "pyautogui":
        name = "execute_pyautogui_code"
    return {
        "id": tool_call_id,
        "type": "function",
        "function": {
            "name": name,
            "arguments": json.dumps(arguments, ensure_ascii=False, default=str),
        },
    }


def select_actionable_tool_call(tool_calls: Sequence[dict]) -> tuple[int, dict] | None:
    """The first non-screenshot call, or the first call when all of them are screenshots."""
    if not tool_calls:
        return None
    for index, tool_call in enumerate(tool_calls):
        if extract_tool_fn(tool_call)[0] != "take_screenshot":
            return index, tool_call
    return 0, tool_calls[0]


def canonicalize_selected_tool_calls(
    tool_calls: Sequence[dict],
    selected_tool_index: int | None = None,
) -> list[dict]:
    """The executed call, followed by the response's first screenshot call if it had one."""
    if selected_tool_index is None:
        selected = select_actionable_tool_call(tool_calls)
        if selected is None:
            return []
        selected_tool_index, _ = selected
    if not 0 <= selected_tool_index < len(tool_calls):
        return []

    selected_call = tool_calls[selected_tool_index]
    selected_name, _, _ = extract_tool_fn(selected_call)
    canonical = [canonicalize_tool_call(selected_call)]
    if selected_name != "take_screenshot":
        screenshot_call = next(
            (
                tool_call
                for tool_call in tool_calls
                if extract_tool_fn(tool_call)[0] == "take_screenshot"
            ),
            None,
        )
        if screenshot_call is not None:
            canonical.append(canonicalize_tool_call(screenshot_call))
    return canonical


_PROJECTED_SCROLL_SIGNATURES = {
    "scroll": ("clicks", "x", "y"),
    "hscroll": ("clicks", "x", "y"),
    "vscroll": ("clicks", "x", "y"),
}


def validate_pyautogui_code(code: str) -> str | None:
    """A static syntax/signature error, or ``None`` when the code is executable."""
    if not isinstance(code, str) or not code.strip():
        return "execute_pyautogui_code requires non-empty Python code."

    try:
        tree = ast.parse(code, mode="exec")
        compile(tree, "<execute_pyautogui_code>", "exec")
    except (SyntaxError, ValueError, TypeError) as exc:
        line = getattr(exc, "lineno", None)
        location = f" on line {line}" if line is not None else ""
        detail = getattr(exc, "msg", None) or str(exc)
        return f"Invalid execute_pyautogui_code syntax{location}: {detail}."

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        function = node.func
        if not (
            isinstance(function, ast.Attribute)
            and isinstance(function.value, ast.Name)
            and function.value.id == "pyautogui"
        ):
            continue

        parameters = _PROJECTED_SCROLL_SIGNATURES.get(function.attr)
        if parameters is None:
            continue
        if any(isinstance(argument, ast.Starred) for argument in node.args) or any(
            keyword.arg is None for keyword in node.keywords
        ):
            continue

        call_name = f"pyautogui.{function.attr}"
        if len(node.args) > len(parameters):
            return (
                f"{call_name} accepts at most {len(parameters)} positional "
                f"arguments in projected actions, but received {len(node.args)}."
            )

        bound = set(parameters[: len(node.args)])
        for keyword in node.keywords:
            name = keyword.arg
            if name not in parameters:
                return f"{call_name} received an unsupported keyword argument {name!r}."
            if name in bound:
                return f"{call_name} received multiple values for argument {name!r}."
            bound.add(name)
        if "clicks" not in bound:
            return f"{call_name} requires the 'clicks' argument."
    return None


def unroll_literal_coordinate_loops(code: str, max_iterations: int = 60) -> str:
    """Unroll small literal loops whose values feed PyAutoGUI coordinates."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return code

    class _SubstituteName(ast.NodeTransformer):
        def __init__(self, name: str, value: int | float):
            self.name = name
            self.value = value

        def visit_Name(self, node):  # noqa: N802 - ast visitor API
            if node.id == self.name and isinstance(node.ctx, ast.Load):
                return ast.copy_location(ast.Constant(self.value), node)
            return node

    def _literal_values(iter_node):
        if isinstance(iter_node, (ast.List, ast.Tuple)):
            values = []
            for element in iter_node.elts:
                if isinstance(element, ast.Constant) and isinstance(
                    element.value, (int, float)
                ):
                    values.append(element.value)
                elif (
                    isinstance(element, ast.UnaryOp)
                    and isinstance(element.op, ast.USub)
                    and isinstance(element.operand, ast.Constant)
                    and isinstance(element.operand.value, (int, float))
                ):
                    values.append(-element.operand.value)
                else:
                    return None
            return values
        if (
            isinstance(iter_node, ast.Call)
            and isinstance(iter_node.func, ast.Name)
            and iter_node.func.id == "range"
            and not iter_node.keywords
        ):
            arguments = []
            for argument in iter_node.args:
                if isinstance(argument, ast.Constant) and isinstance(
                    argument.value, int
                ):
                    arguments.append(argument.value)
                else:
                    return None
            try:
                return list(range(*arguments))
            except (TypeError, ValueError):
                return None
        return None

    changed = False

    class _Unroller(ast.NodeTransformer):
        def visit_For(self, node):  # noqa: N802 - ast visitor API
            nonlocal changed
            self.generic_visit(node)
            if node.orelse or not isinstance(node.target, ast.Name):
                return node
            values = _literal_values(node.iter)
            if not values or len(values) > max_iterations:
                return node
            if not all(
                isinstance(statement, ast.Expr)
                and isinstance(statement.value, ast.Call)
                for statement in node.body
            ):
                return node
            uses_pyautogui = any(
                isinstance(descendant, ast.Attribute)
                and isinstance(descendant.value, ast.Name)
                and descendant.value.id == "pyautogui"
                for statement in node.body
                for descendant in ast.walk(statement)
            )
            if not uses_pyautogui:
                return node

            new_statements = []
            for value in values:
                substituter = _SubstituteName(node.target.id, value)
                for statement in node.body:
                    new_statements.append(
                        ast.fix_missing_locations(
                            substituter.visit(copy.deepcopy(statement))
                        )
                    )
            changed = True
            return new_statements

    new_tree = _Unroller().visit(tree)
    if not changed:
        return code
    try:
        ast.fix_missing_locations(new_tree)
        unrolled = ast.unparse(new_tree)
        logger.warning(
            "Unrolled literal coordinate loop(s) for projection; "
            f"code went from {len(code)} to {len(unrolled)} chars."
        )
        return unrolled
    except Exception as exc:
        logger.warning(f"Loop unroll failed, keeping original code: {exc}")
        return code


_FUNCTION_PARAMETERS = {
    "click": ["x", "y", "clicks", "interval", "button", "duration", "pause"],
    "rightClick": ["x", "y", "duration", "tween", "pause"],
    "middleClick": ["x", "y", "duration", "tween", "pause"],
    "doubleClick": ["x", "y", "interval", "button", "duration", "pause"],
    "tripleClick": ["x", "y", "interval", "button", "duration", "pause"],
    "moveTo": ["x", "y", "duration", "tween", "pause"],
    "dragTo": ["x", "y", "duration", "tween", "button", "logScreenshot", "_pause", "mouseDownUp"],
    "scroll": ["clicks", "x", "y"],
    "hscroll": ["clicks", "x", "y"],
    "vscroll": ["clicks", "x", "y"],
}


def project_coordinate_to_absolute_scale(code: str, screen_width: int, screen_height: int) -> str:
    """PyAutoGUI code with literal coordinates in screen pixels: an (x, y) pair with both
    values at or below 1.0 is scaled by the screen size, a larger pair is rounded."""

    def _coordinate_projection(x, y):
        if x <= 1.0 and y <= 1.0:
            return int(round(x * screen_width)), int(round(y * screen_height))
        return int(round(x)), int(round(y))

    code = unroll_literal_coordinate_loops(code)
    matches = re.findall(r"(pyautogui\.\w+\([^\)]*\))", code)
    new_code = code

    for full_call in matches:
        function_match = re.match(r"(pyautogui\.\w+)\((.*)\)", full_call, re.DOTALL)
        if not function_match:
            continue
        function_name = function_match.group(1)
        arguments_text = function_match.group(2)
        try:
            parsed = ast.parse(f"func({arguments_text})").body[0].value
            parsed_arguments = parsed.args
            parsed_keywords = parsed.keywords
        except SyntaxError:
            return code

        parameter_names = _FUNCTION_PARAMETERS.get(function_name.split(".")[-1], [])
        arguments = {}
        try:
            for index, argument in enumerate(parsed_arguments):
                if index < len(parameter_names):
                    arguments[parameter_names[index]] = ast.literal_eval(argument)
        except Exception as exc:
            logger.warning(
                f"Skipping coordinate projection for non-literal call "
                f"{full_call!r}: {exc}"
            )
            continue
        try:
            for keyword in parsed_keywords:
                arguments[keyword.arg] = ast.literal_eval(keyword.value)
        except Exception as exc:
            logger.warning(
                f"Skipping coordinate projection for non-literal kwargs in "
                f"{full_call!r}: {exc}"
            )
            continue

        updated = False
        if "x" in arguments and "y" in arguments:
            try:
                arguments["x"], arguments["y"] = _coordinate_projection(
                    float(arguments["x"]), float(arguments["y"])
                )
                updated = True
            except ValueError:
                pass

        if updated:
            reconstructed_arguments = []
            for parameter_name in parameter_names:
                if parameter_name not in arguments:
                    break
                argument_value = arguments[parameter_name]
                argument_repr = (
                    f"'{argument_value}'"
                    if isinstance(argument_value, str)
                    else str(argument_value)
                )
                reconstructed_arguments.append(argument_repr)

            used_parameters = set(parameter_names[: len(reconstructed_arguments)])
            for keyword in parsed_keywords:
                if keyword.arg in used_parameters:
                    continue
                argument_value = arguments[keyword.arg]
                argument_repr = (
                    f"{keyword.arg}='{argument_value}'"
                    if isinstance(argument_value, str)
                    else f"{keyword.arg}={argument_value}"
                )
                reconstructed_arguments.append(argument_repr)

            new_arguments_text = ", ".join(reconstructed_arguments)
            new_full_call = f"{function_name}({new_arguments_text})"
            new_code = new_code.replace(full_call, new_full_call)
    return new_code


def _protocol_error(message: str, sections: dict[str, Any]):
    sections["code"] = "PROTOCOL_ERROR"
    sections["protocol_error"] = message
    return message, [{"action_type": "PROTOCOL_ERROR", "message": message}], sections


def _bounded_wait_seconds(value: Any) -> int:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        seconds = 20
    return max(1, min(seconds, 60))


def parse_kimi_tool_calls_to_action(response_content: str, tool_calls: list, screen_size):
    """Returns (low_level_instruction, actions, sections) for one model response."""
    sections: dict[str, Any] = {}
    action_text = parse_action_text(response_content or "")
    if action_text:
        sections["action"] = action_text
    if not tool_calls:
        return _protocol_error(
            "The model returned no tool call; an actionable tool call is required.",
            sections,
        )

    selected_tool_index, chosen = select_actionable_tool_call(tool_calls)
    name, arguments, tool_call_id = extract_tool_fn(chosen)
    sections.update(
        {
            "tool_name": name,
            "tool_arguments": arguments,
            "tool_call_id": tool_call_id,
            "selected_tool_index": selected_tool_index,
        }
    )
    if isinstance(arguments, _InvalidToolArguments):
        return _protocol_error(
            f"{name or 'Tool'} arguments must be a JSON object; got "
            f"{arguments.diagnostic}.",
            sections,
        )

    if name == "wait_for_state":
        seconds = _bounded_wait_seconds(arguments.get("seconds", 20))
        sections["code"] = "WAIT_FOR_STATE"
        return (
            sections.get("action") or f"wait_for_state(seconds={seconds})",
            [
                {
                    "action_type": "WAIT_FOR_STATE",
                    "seconds": seconds,
                    "reason": str(arguments.get("reason") or "").strip(),
                    "tool_call_id": tool_call_id,
                }
            ],
            sections,
        )

    if name == "finish_task":
        status = str(arguments.get("status") or "").strip().casefold()
        if status not in {"success", "failure"}:
            return _protocol_error(
                "finish_task requires status='success' or status='failure'.",
                sections,
            )
        terminal_action = "DONE" if status == "success" else "FAIL"
        sections["code"] = terminal_action
        sections["answer"] = str(arguments.get("answer") or "")
        return (
            sections.get("action") or f"finish_task(status={status!r})",
            [terminal_action],
            sections,
        )

    if name == "run_command":
        return _protocol_error(
            "run_command is unavailable in GUI mode; use "
            "execute_pyautogui_code to interact with the visible desktop.",
            sections,
        )

    if name not in {"take_screenshot", "pyautogui", "execute_pyautogui_code", "computer", "ask_user"}:
        return _protocol_error(
            f"Unknown tool {name!r}; use one of the declared tools.", sections
        )

    if name == "ask_user":
        return _protocol_error(
            "ask_user is unavailable for this task; continue using the "
            "environment.",
            sections,
        )

    if name in ("pyautogui", "execute_pyautogui_code"):
        code = arguments.get("code")
        validation_error = validate_pyautogui_code(code)
        if validation_error:
            return _protocol_error(validation_error, sections)
        projected_code = project_coordinate_to_absolute_scale(code, screen_size[0], screen_size[1])
        validation_error = validate_pyautogui_code(projected_code)
        if validation_error:
            return _protocol_error(
                f"Coordinate projection produced invalid code: {validation_error}",
                sections,
            )
        code_block = code.strip()
        sections["original_code"] = code_block
        corrected_code = project_coordinate_to_absolute_scale(code_block, screen_size[0], screen_size[1])
        sections["code"] = corrected_code
        return sections.get("action") or code_block, [corrected_code], sections

    if name == "computer":
        action_kind = (arguments.get("action") or "").lower().strip()
        sections["answer"] = str(arguments.get("answer") or "")
        if action_kind == "wait":
            sections["code"] = "WAIT"
            return sections.get("action") or "computer.wait()", ["WAIT"], sections
        if action_kind == "terminate":
            status = (arguments.get("status") or "").lower().strip()
            if status in ("failure", "fail"):
                sections["code"] = "FAIL"
                return (
                    sections.get("action") or "computer.terminate(status='failure')",
                    ["FAIL"],
                    sections,
                )
            sections["code"] = "DONE"
            return (
                sections.get("action") or "computer.terminate(status='success')",
                ["DONE"],
                sections,
            )
        error = f"<Error>: unknown computer action {action_kind!r}"
        logger.error(error)
        return error, ["FAIL"], sections

    # take_screenshot alone
    sections["code"] = "WAIT"
    return sections.get("action") or "take_screenshot()", ["WAIT"], sections
