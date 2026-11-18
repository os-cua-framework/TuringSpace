# Benchmark loaders: files written by prepare_data.py -> a list of items
#   {id, bench, sub, kind, images: [paths], ...}
#   kind 'mcq':   text (full prompt), answer (option letter)
#   kind 'na':    text (full prompt), answer (number)                 VSI-Bench numeric questions
#   kind 'point': request (question without answer-format suffix), target {'mask': path}
import ast
import json

BENCHES = ['spatialviz', 'refspatial', 'vsibench', 'vabench_point', 'roboafford']

# VLMEvalKit vlmeval/dataset/spatialvizbench.py, SpatialVizBench (no CoT suffix)
SPATIALVIZ_PRE = ('Answer with a single option letter (A, B, C, or D), enclosed within the <answer></answer> tag. '
                  'For example: <answer>A</answer>. Ensure that your output contains only the final answer, '
                  'without any intermediate reasoning or additional content.')

# EASI VLMEvalKit vlmeval/dataset/vsibench.py, VsiBench.build_prompt
VSI_PRE = 'These are frames of a video.'
VSI_MCQ_POST = "Answer with the option's letter from the given choices directly."
VSI_NA_POST = 'Answer briefly and directly in one float number.'
VSI_MCQ = {'obj_appearance_order', 'object_rel_direction_easy', 'object_rel_direction_hard',
           'object_rel_direction_medium', 'object_rel_distance', 'route_planning'}


def _jsonl(path):
    return [json.loads(line) for line in open(path)]


def spatialviz(root):
    E = f'{root}/easi'
    out = []
    for r in _jsonl(f'{E}/SpatialVizBench.jsonl'):
        options = ''.join(f'{c}. {r[c]}\n' for c in 'ABCD' if c in r)
        text = SPATIALVIZ_PRE + '\n' + 'Question:' + r['question'] + '\n' + options
        out.append(dict(id=f"spatialviz/{r['index']}", bench='spatialviz', sub=f"{r['category']}/{r['task']}",
                        kind='mcq', images=[f'{E}/{p}' for p in r['image_path']], text=text, answer=r['answer']))
    return out


def refspatial(root):
    d = f'{root}/RefSpatial-Bench'
    out = []
    for r in _jsonl(f'{root}/easi/RefSpatial.jsonl'):
        sub = r['category'].capitalize()
        out.append(dict(id=f"refspatial/{sub}/{r['index']}", bench='refspatial', sub=sub, kind='point',
                        images=[f"{d}/{p}" for p in r['image_path']],
                        target={'mask': f"{d}/{r['mask_path'][0]}"}, request=r['question']))
    return out


def vsibench(root):
    out = []
    for r in _jsonl(f'{root}/easi/VSI-Bench.jsonl'):
        mcq = r['question_type'] in VSI_MCQ
        parts = [VSI_PRE, r['question']] + (['\n'.join(ast.literal_eval(r['candidates'])), VSI_MCQ_POST] if mcq
                                            else [VSI_NA_POST])
        out.append(dict(id=f"vsibench/{r['index']}", bench='vsibench', sub=r['question_type'],
                        kind='mcq' if mcq else 'na', images=r['frames'], text='\n'.join(parts), answer=r['answer'],
                        video=r['video']))
    return out


def vabench_point(root):
    # sub = the source dataset in the id (fsd_<source>_<n>)
    d = f'{root}/VABench-P'
    return [dict(id=f"vabench_point/{r['id']}", bench='vabench_point', sub=r['id'].split('_')[1], kind='point',
                 images=[f"{d}/{r['image']}"], target={'mask': f"{d}/{r['mask']}"}, request=r['problem'])
            for r in _jsonl(f'{d}/items.jsonl')]


def roboafford(root):
    d = f'{root}/roboafford-eval'
    return [dict(id=f"roboafford/{r['row']}", bench='roboafford', sub=r['category'], kind='point',
                 images=[f"{d}/{r['image']}"], target={'mask': f"{d}/{r['mask']}"}, request=r['question'])
            for r in _jsonl(f'{d}/items.jsonl')]


def load(name, root):
    return globals()[name](root)
