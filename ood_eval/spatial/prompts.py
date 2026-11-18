# Chat messages for each item. Both models get the same messages.
#   SpatialViz-Bench, VSI-Bench: the item's text (VLMEvalKit prompt, see benches.py) after the images
#   RefSpatial-Bench:            VLMEvalKit's RefSpatial prompt, the request followed by POINT_POST
#   VABench-Point, RoboAfford:   EmbodiedEvalKit's prompt for --backbone qwen3 (eek_question)
import textwrap

# VLMEvalKit vlmeval/dataset/refspatialbench.py; appended to the request with no separator
POINT_POST = (
    'Output the point coordinates in JSON format.\n'
    'For example:\n'
    '[\n'
    '  {"point_2d": [x, y], "label": "point_1"}\n'
    ']\n'
)

# EmbodiedEvalKit (github.com/pickxiguapi/EmbodiedEvalKit @ 5ec3a60e), eval_<bench>.py --backbone qwen3 and
# benchmark/<bench>.py; messages as its vllm_engine.prepare_messages
EEK_SYSTEM = 'You are a helpful assistant.'
EEK_QWEN3_POINT = 'The answer should be presented in JSON format as follows: [{"point_2d": [x, y]}].'
EEK_DATA_FORMAT = 'Your answer should be formatted as a list of tuples'
ROBOAFFORD_POINT = ('Provide your answer as 2D point coordinates: each tuple contains the x and y coordinates of a '
                    'point meeting the above conditions.')
EEK_BENCHES = ('vabench_point', 'roboafford')


def eek_question(item):
    """the user text EmbodiedEvalKit builds for this item"""
    q, b = item['request'], item['bench']
    if b == 'vabench_point':
        return textwrap.dedent(q + '\n' + EEK_QWEN3_POINT).strip()
    if b == 'roboafford':
        k = q.find(EEK_DATA_FORMAT)
        if k != -1:
            q = q[:k]
        q = (q + '' + ROBOAFFORD_POINT).strip()
        return textwrap.dedent(q + '\n' + EEK_QWEN3_POINT).strip()
    raise ValueError(b)


def image_part(url):
    return {'type': 'image_url', 'image_url': {'url': url}}


def build(item, image_urls):
    """-> messages for one item; image_urls in item['images'] order"""
    imgs = [image_part(u) for u in image_urls]
    if item['kind'] in ('mcq', 'na'):
        return [{'role': 'user', 'content': imgs + [{'type': 'text', 'text': item['text']}]}]
    if item['bench'] in EEK_BENCHES:
        return [{'role': 'system', 'content': [{'type': 'text', 'text': EEK_SYSTEM}]},
                {'role': 'user', 'content': imgs + [{'type': 'text', 'text': eek_question(item)}]}]
    return [{'role': 'user', 'content': imgs + [{'type': 'text', 'text': item['request'] + POINT_POST}]}]
