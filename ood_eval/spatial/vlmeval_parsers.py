# Copied from VLMEvalKit.
# can_match_option, Point2DParser: github.com/open-compass/VLMEvalKit @ e6fceda,
#   vlmeval/dataset/utils/spatial_bench/matching_func.py and tools/utils.py
# can_match_na, mean_relative_accuracy: github.com/EvolvingLMMs-Lab/VLMEvalKit (EASI branch) @ eb59239,
#   vlmeval/dataset/utils/spatial_bench/matching_func.py and cal_scores.py
import ast
import json
import logging
import re

import numpy as np


# Zero-width characters (BOM, ZWSP, ZWNJ, ZWJ)
ZW_RE = re.compile(
    r'[\u200b\u200c\u200d\ufeff]'
)

# Generic numeric pattern: integer / float / scientific notation
NUMERIC_PATTERN = r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?'

_NUM_RE = re.compile(NUMERIC_PATTERN)

# <answer>...</answer> block with a leading option letter (A–J)
TAGGED_ANSWER_BLOCK = re.compile(
    r'<\s*answer\b[^>]*>'  # <answer ...>
    r'\s*'
    r'([A-Ja-j])'
    r'(?![A-Za-z])'  # A label must not be the first letter of a word.
    r'(?:\s*[\.．:：\)\]】、])?'  # Optional trailing punctuation, e.g. A. / A: / A) etc.
    r'.*?'
    r'<\s*/\s*answer\s*>',
    flags=re.IGNORECASE | re.DOTALL,
)

# Numeric answer inside <answer>...</answer>
TAGGED_NUMERIC_ANSWER = re.compile(
    rf'<\s*answer\b[^>]*>'
    rf'\s*'
    rf'({NUMERIC_PATTERN})'
    rf'(?:[^\d<][^<]*)?'
    rf'<\s*/\s*answer\s*>',
    flags=re.IGNORECASE | re.DOTALL,
)


def can_match_option(
    answer_text: str,
    choices=None,
    tail_lines: int = 6,
    tail_window: int = 800
):
    """
    Extract a single-choice option letter from free-form model output.

    Return:
        - 'A'..'F' (or restricted by `choices`) if a reliable match is found
        - False otherwise

    Procedure (1 → 7):
      1) Dynamic letter set: build allowed letters (default A–F; shrink if `choices` given)
      2) Block-level: <answer>...</answer> with leading letter (A–J allowed here)
      3) Tail anchors: a letter immediately before </answer> or </think> within the tail window
      4) Last-lines (after think-tail): scan last N lines after the last </think> (or <think>)
         - full-line single letter (markdown/brackets allowed)
         - labeled line start "A. ..."/"B) ..."
         - unique inline uppercase token not part of words
      5) Last-lines (global tail): same scan on the last N lines of the whole tail window
      6) Phrase-style conclusion (tail window only), e.g. "final answer: B"
         - capture is UPPERCASE only; use the last occurrence
      7) Global fallback (strict): after removing enumeration lines, accept ONLY one
         unique UPPERCASE standalone token across the entire text
    """
    # 1) Dynamic letter set
    if not isinstance(answer_text, str):
        return False
    text = ZW_RE.sub('', answer_text.strip())

    if choices:
        letters_sorted = ''.join(sorted({str(c).strip().upper()[:1] for c in choices if str(c)}))
        letters = ''.join([ch for ch in 'ABCDEFGHIJ' if ch in letters_sorted]) or 'ABCDEF'
    else:
        letters = 'ABCDEF'

    # 2) Block-level <answer>...</answer>
    m_block = TAGGED_ANSWER_BLOCK.search(text)
    if m_block:
        return m_block.group(1).upper()

    # 3) Tail anchors: before </answer> / </think>
    tail_block = text[-tail_window:]
    PAT_ANS = re.compile(
        rf'(?<![A-Za-z])'          # Not preceded by a letter
        rf'[\(\[\{{（【]?\s*'       # Optional left bracket + whitespace
        rf'([{letters}])\s*'       # One option letter from `letters`
        rf'[\)\]\}}）】]?\s*'       # Optional right bracket + whitespace
        rf'</\s*answer\s*>',       # Closing </answer> tag
        re.IGNORECASE,
    )
    PAT_THINK = re.compile(
        rf'(?<![A-Za-z])'
        rf'[\(\[\{{（【]?\s*'
        rf'([{letters}])\s*'
        rf'[\)\]\}}）】]?\s*'
        rf'</\s*think\s*>',
        re.IGNORECASE,
    )
    for pat in (PAT_ANS, PAT_THINK):
        m = pat.search(tail_block)
        if m:
            return m.group(1).upper()

    # Helpers for steps 4 & 5
    # Punctuation treated as tight boundary after a token (EN + CN)
    _PUNC_TIGHT = r"\.,:;!?\)\]】》」』，。；、：）】》」』"
    # Lines that start with "option A:" / "选项 A:" style prefixes
    OPTION_LINE_PREFIX = re.compile(
        r'^(?:[*_>\-\s]*)(?:option|选项)\s+[A-J]\s*[:：]',
        re.IGNORECASE,
    )
    # Lines whose content is a single option letter (with optional markdown/brackets)
    MD_SINGLE = re.compile(
        r'^\s*[*_`>（）\[\]【】\(\)]*\s*([A-Fa-f])\s*[*_`（）\[\]【】\(\)]*\s*$'
    )
    # Lines starting with "A. ...", "B) ...", etc.
    LINE_START_LABELED = re.compile(
        r'^\s*([A-F])\s*[\.．:：\)\]】、-]\s+',
        re.IGNORECASE,
    )
    # Inline standalone uppercase token (not part of a word), e.g. the A in "answer A."
    TOKEN_INLINE = re.compile(
        rf'(?<![A-Za-z])'          # Not preceded by a letter
        rf'[*_`（\[\{{\(]*\s*'     # optional prefix symbols + whitespace
        rf'([A-F])\s*'             # Capture a single uppercase letter A–F
        rf'[*_`）\]\}})]*'         # Optional suffix symbols
        rf'(?=$|[\s{_PUNC_TIGHT}])'  # Followed by end, whitespace, or tight punctuation
    )

    def _pick_from_lines(lines):
        for line in reversed([ln.strip() for ln in lines if ln.strip()]):
            if OPTION_LINE_PREFIX.search(line):
                continue
            m = MD_SINGLE.fullmatch(line)
            if m:
                return m.group(1).upper()
            m = LINE_START_LABELED.match(line)
            if m:
                return m.group(1).upper()
            tokens = [t.upper() for t in TOKEN_INLINE.findall(line)]
            if tokens:
                uniq = sorted(set(tokens))
                if len(uniq) == 1:
                    return uniq[0]
        return None

    # 4) Last-lines after think-tail
    if re.search(r'</\s*think\s*>', text, re.IGNORECASE):
        tail_segment = text[list(re.finditer(r'</\s*think\s*>', text, re.IGNORECASE))[-1].end():].strip()
    elif re.search(r'<\s*think\s*>', text, re.IGNORECASE):
        tail_segment = text[list(re.finditer(r'<\s*think\s*>', text, re.IGNORECASE))[-1].end():].strip()
    else:
        tail_segment = text

    pick = _pick_from_lines(tail_segment.splitlines()[-tail_lines:])
    if pick:
        return pick

    # 5) Last-lines in global tail window
    pick = _pick_from_lines(text[-tail_window:].splitlines()[-tail_lines:])
    if pick:
        return pick

    # 6) Phrase-style conclusion in tail window (last match)
    PHRASE_AFTER = re.compile(
        # Prefix phrases like "final answer", "the answer is", "答案", "我选", etc.
        rf'(?i)(?:final\s*answer|the\s*answer\s*is|answer(?:\s*is)?|correct\s*answer|'
        rf'答案|最终答案|结论|所以|因此|我选(?:择)?|选择|选)'
        rf'\s*[:：>＝=]?\s*'         # optional separator (:, ：, >, ＝, =)
        rf'[\(\[\{{（【]?\s*'        # optional left bracket
        rf'([{letters}])'           # option letter from `letters`
        rf'\s*[\)\]\}}）】]?'        # optional right bracket
        rf'(?:\b|[.)、。])'          # followed by boundary / end punctuation
    )

    m = PHRASE_AFTER.search(text)
    if m:
        return m.group(1).upper()

    # 7) Global fallback: uppercase-only & unique (skip enumerations)
    cleaned_lines = []
    for ln in text.splitlines():
        if OPTION_LINE_PREFIX.search(ln):
            continue
        cleaned_lines.append(ln)
    cleaned = "\n".join(cleaned_lines)

    TOKEN_UPPER_GLOBAL = re.compile(
        # Standalone option letter (not part of a word)
        rf'(?<![A-Za-z])'          # left side not a letter
        rf'[\(\[\{{（【]?\s*'       # optional left bracket + spaces
        rf'([{letters}])\s*'       # one letter from `letters`
        rf'[\)\]\}}）】]?'          # optional right bracket
        rf'(?![A-Za-z])'           # right side not a letter
    )
    tokens = TOKEN_UPPER_GLOBAL.findall(cleaned)

    uniq = sorted(set(tokens))
    if len(uniq) == 1:
        return uniq[0]

    return False



class Point2DParser:
    logger = logging.getLogger('Point2DParser')
    """
    Generic 2D point parser.

    - Parse model outputs into a set of (x, y) coordinates.
    - Support JSON / Python literals and text patterns.
    - First use _json2pts, then fall back to _text2pts.
    """

    _has_logged_hint = False

    @classmethod
    def log_hint(cls, task_name: str | None = None):
        if cls._has_logged_hint:
            return

        prefix = f'[{task_name}]' if task_name else '[Point2DParser]'
        msg = (
            f'{prefix} Using default Point2DParser:\n'
            '  - expects JSON / Python literal with "point_2d",\n'
            '    where coordinates may be:\n'
            '      * pixels (0 ~ W/H),\n'
            '      * [0, 1] normalized,\n'
            '      * [0, 1000] normalized (e.g., Qwen3-VL style);\n'
            '  - falls back to "(x, y)" or "(x0, y0, x1, y1)" patterns in free text.\n'
            'Use parse(..., output="pixel") for pixel coords (default), or\n'
            'parse(..., output="norm") for [0, 1] normalized coords.\n'
        )
        cls.logger.info(msg)
        cls._has_logged_hint = True

    @classmethod
    def parse(cls, text: str, width: int, height: int, output: str = 'pixel') -> np.ndarray:
        """
        Main entry.

        Args:
            text: raw model output.
            width, height: image size.
            output: 'pixel' for pixel coords, 'norm' for [0, 1] normalized coords.

        Returns:
            np.ndarray[N, 2]
        """
        if output not in ('pixel', 'norm'):
            raise ValueError(f'Point2DParser.parse: unsupported output={output}')

        pts = cls._json2pts(text, width, height, output=output)
        if pts is not None:
            return pts
        return cls._text2pts(text, width, height, output=output)

    @classmethod
    def _json2pts(
        cls,
        text: str,
        width: int = 640,
        height: int = 480,
        output: str = 'pixel'
    ) -> np.ndarray | None:
        """
        Parse JSON/Python literals like:
        [
            {"point_2d": [x, y], "label": "..."},
            ...
        ]

        point_2d / point can be:
          - [0, 1] normalized
          - [0, 1000] normalized
          - pixels
        """
        s = cls._strip_md_fence(text).strip()

        obj = None
        try:
            obj = json.loads(s)
        except Exception:
            pass

        if obj is None:
            try:
                obj = ast.literal_eval(s)
            except Exception:
                return None

        if isinstance(obj, dict):
            obj = [obj]
        if not isinstance(obj, list):
            return None

        pts_norm = []  # Store uniformly as 0~1 coordinates
        w = float(width) if width else 1.0
        h = float(height) if height else 1.0

        for item in obj:
            if not isinstance(item, dict):
                continue
            pt = item.get('point_2d') or item.get('point')
            if not (isinstance(pt, (list, tuple)) and len(pt) == 2):
                continue

            x, y = pt
            try:
                x = float(x)
                y = float(y)
            except Exception:
                continue

            max_abs = max(abs(x), abs(y))

            # map to [0,1]
            if 0.0 <= max_abs <= 1.5:
                x_norm, y_norm = x, y
            elif 0.0 <= max_abs <= 1000.0:
                x_norm = x / 1000.0
                y_norm = y / 1000.0
            else:
                # assume pixels
                x_norm = x / w
                y_norm = y / h

            pts_norm.append((x_norm, y_norm))

        if not pts_norm:
            return None

        pts_norm = np.array(pts_norm, dtype=float)

        if output == 'norm':
            return pts_norm

        # output == 'pixel'
        x_pix = np.clip(pts_norm[:, 0] * w, 0, w - 1)
        y_pix = np.clip(pts_norm[:, 1] * h, 0, h - 1)
        pts_pix = np.stack([x_pix, y_pix], axis=1).round().astype(int)
        return pts_pix

    @staticmethod
    def _text2pts(
        text: str,
        width: int = 640,
        height: int = 480,
        output: str = 'pixel'
    ) -> np.ndarray:
        """
        Parse free-text patterns:
            (x, y) or (x0, y0, x1, y1)
        """
        pattern = r'\(([-+]?\d+\.?\d*(?:,\s*[-+]?\d+\.?\d*)*?)\)'
        matches = re.findall(pattern, text)
        pts_norm = []
        w = float(width) if width else 1.0
        h = float(height) if height else 1.0

        for match in matches:
            nums = [float(num) for num in match.split(',')]
            max_abs = max(abs(v) for v in nums)
            is_norm = (0.0 <= max_abs <= 1.5)

            if len(nums) == 2:
                x, y = nums
                if is_norm:
                    x_norm, y_norm = x, y
                else:
                    x_norm = x / w
                    y_norm = y / h
                pts_norm.append((x_norm, y_norm))

            elif len(nums) == 4:
                x0, y0, x1, y1 = nums
                if is_norm:
                    x0 *= w
                    y0 *= h
                    x1 *= w
                    y1 *= h

                x0, y0, x1, y1 = map(float, (x0, y0, x1, y1))
                if x1 < x0:
                    x0, x1 = x1, x0
                if y1 < y0:
                    y0, y1 = y1, y0

                x0_i, y0_i, x1_i, y1_i = map(int, map(round, (x0, y0, x1, y1)))
                h_box = max(0, y1_i - y0_i)
                w_box = max(0, x1_i - x0_i)
                if h_box > 0 and w_box > 0:
                    yy, xx = np.where(np.ones((h_box, w_box), dtype=np.uint8))
                    x_pix = xx + x0_i
                    y_pix = yy + y0_i
                    x_norm = x_pix / w
                    y_norm = y_pix / h
                    pts_norm.extend(zip(x_norm, y_norm))

        if not pts_norm:
            return np.empty((0, 2), dtype=float if output == 'norm' else int)

        pts_norm = np.array(pts_norm, dtype=float)

        if output == 'norm':
            return pts_norm

        # output == 'pixel'
        x_pix = np.clip(pts_norm[:, 0] * w, 0, w - 1)
        y_pix = np.clip(pts_norm[:, 1] * h, 0, h - 1)
        pts_pix = np.stack([x_pix, y_pix], axis=1).round().astype(int)
        return pts_pix

    @staticmethod
    def _strip_md_fence(text: str) -> str:
        s = text.strip()
        if not s.startswith('```'):
            return s

        first_nl = s.find('\n')
        if first_nl != -1:
            inner = s[first_nl + 1:]
        else:
            inner = s.lstrip('`')

        inner = inner.strip()
        if inner.endswith('```'):
            inner = inner[:-3]
        return inner.strip()


def _after_think(text: str) -> str:
    m_end = list(re.finditer(r'</\s*think\s*>', text, flags=re.IGNORECASE))
    if m_end:
        return text[m_end[-1].end():].strip()
    m_start = list(re.finditer(r'<\s*think\s*>', text, flags=re.IGNORECASE))
    if m_start:
        return text[m_start[-1].end():].strip()
    return text


def _last_number(s: str):
    nums = re.findall(_NUM_RE, s)
    if nums:
        return float(nums[-1])
    return None


# num2words(i) for i in 0..20, written out
_WORDS_0_20 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
               'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
WORD2NUM = {w: i for i, w in enumerate(_WORDS_0_20)}
WORD_NUMBER_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in WORD2NUM.keys()) + r")\b",
    flags=re.IGNORECASE,
)


def normalize_number_words(text: str) -> str:
    def _repl(m: re.Match) -> str:
        key = m.group(1).lower()
        val = WORD2NUM.get(key)
        return str(val) if val is not None else m.group(0)

    return WORD_NUMBER_PATTERN.sub(_repl, text)


def can_match_na(pred):
    try:
        if isinstance(pred, list):
            candidates = [str(pred[0])] if pred else []
        elif isinstance(pred, str) and pred.strip().startswith('[') and pred.strip().endswith(']'):
            seq = ast.literal_eval(pred)  # safer than eval
            candidates = [str(seq[0])] if isinstance(seq, list) and seq else [pred]
        else:
            candidates = [str(pred)]

        for raw in candidates:
            text = ZW_RE.sub('', raw.strip())
            text = normalize_number_words(text)

            m = TAGGED_NUMERIC_ANSWER.search(text)
            if m:
                try:
                    return float(m.group(1))
                except Exception:
                    pass

            tail = _after_think(text)
            v = _last_number(tail)
            if v is not None:
                return v

            nums = re.findall(_NUM_RE, text)
            if nums:
                uniq = sorted(set(nums))
                if len(uniq) == 1:
                    return float(uniq[0])
                return float(nums[-1])

        return None
    except Exception:
        return None


def abs_dist_norm(pred: float, target: float) -> float:
    if target == 0.0:
        return abs(pred - target)
    else:
        return abs((pred - target) / target)


def mean_relative_accuracy(pred: float, target: float, start: float = 0.5, end: float = 0.95,
                           interval: float = 0.05) -> float:
    num_pts = int((end - start) / interval + 2)
    conf_intervs = np.linspace(start, end, num_pts)
    err = abs_dist_norm(pred, target)
    ok = (err <= (1 - conf_intervs)).astype(float)
    return float(ok.mean())
