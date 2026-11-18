import base64
import json
import logging
import math
from io import BytesIO

from PIL import Image

logger = logging.getLogger("desktopenv.evocua.utils")


def round_by_factor(number: int, factor: int) -> int:
    return round(number / factor) * factor


def ceil_by_factor(number: int, factor: int) -> int:
    return math.ceil(number / factor) * factor


def floor_by_factor(number: int, factor: int) -> int:
    return math.floor(number / factor) * factor


def smart_resize(height, width, factor=28, min_pixels=56 * 56, max_pixels=14 * 14 * 4 * 1280, max_long_side=8192):
    """Qwen-VL resize: sides divisible by factor, pixel count in [min_pixels, max_pixels], aspect ratio kept."""
    if height < 2 or width < 2:
        raise ValueError(f"height:{height} or width:{width} must be larger than factor:{factor}")
    elif max(height, width) / min(height, width) > 200:
        raise ValueError(f"absolute aspect ratio must be smaller than 100, got {height} / {width}")

    if max(height, width) > max_long_side:
        beta = max(height, width) / max_long_side
        height, width = int(height / beta), int(width / beta)

    h_bar = round_by_factor(height, factor)
    w_bar = round_by_factor(width, factor)
    if h_bar * w_bar > max_pixels:
        beta = math.sqrt((height * width) / max_pixels)
        h_bar = floor_by_factor(height / beta, factor)
        w_bar = floor_by_factor(width / beta, factor)
    elif h_bar * w_bar < min_pixels:
        beta = math.sqrt(min_pixels / (height * width))
        h_bar = ceil_by_factor(height * beta, factor)
        w_bar = ceil_by_factor(width * beta, factor)
    return h_bar, w_bar


def process_image(image_bytes, factor=32):
    """Resizes a screenshot for the model; returns (base64 PNG, width, height)."""
    image = Image.open(BytesIO(image_bytes))
    width, height = image.size

    resized_height, resized_width = smart_resize(
        height=height,
        width=width,
        factor=factor,
        max_pixels=16 * 16 * 4 * 12800,
    )

    image = image.resize((resized_width, resized_height))

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8"), resized_width, resized_height


def log_messages(messages, prefix="LLM Messages"):
    """Logs messages with the base64 images truncated."""
    try:
        log_msgs = []
        for msg in messages:
            msg_copy = msg.copy()
            content = msg.get("content")
            if isinstance(content, list):
                new_content = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "image_url":
                        item_copy = item.copy()
                        url = item_copy.get("image_url", {}).get("url", "")
                        if len(url) > 100:
                            item_copy["image_url"] = {"url": url[:30] + "...[base64_truncated]..." + url[-10:]}
                        new_content.append(item_copy)
                    else:
                        new_content.append(item)
                msg_copy["content"] = new_content
            log_msgs.append(msg_copy)
        logger.info(f"{prefix}:\n{json.dumps(log_msgs, indent=2, ensure_ascii=False)}")
    except Exception as e:
        logger.warning(f"Failed to log messages: {e}")
