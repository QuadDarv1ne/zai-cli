'''
pip install audiocraft
'''

from audiocraft.models import MusicGen
model = MusicGen.get_pretrained('facebook/musicgen-small')
model.set_generation_params(duration=8)
output = model.generate(["a calm lo-fi hip hop beat"], cfg_coef=3)
