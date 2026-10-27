"""Render original static cinematic planetary scenes for the no-WebGL fallback.
The site's primary hero remains a real animated WebGL scene.
"""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import numpy as np

P=Path(__file__).resolve().parent.parent/'assets'
W,H=1800,1050
STARS=Image.open(P/'starfield.webp').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
L=(.68,.5,.98)

def planet(name,diameter):
    tex=np.asarray(Image.open(P/f'planet-{name}.webp').convert('RGB'),dtype=np.float32)
    r=diameter//2
    y,x=np.ogrid[-r:r,-r:r]
    xx=np.broadcast_to(x.astype(np.float32)/r,(diameter,diameter))
    yy=np.broadcast_to(y.astype(np.float32)/r,(diameter,diameter))
    d=xx*xx+yy*yy
    mask=d<=1
    zz=np.sqrt(np.maximum(0,1-d))
    u=(np.arctan2(xx,zz)/(2*np.pi)+.5)* (tex.shape[1]-1)
    v=(np.arccos(np.clip(-yy,-1,1))/np.pi)*(tex.shape[0]-1)
    u=np.clip(u.astype('int32'),0,tex.shape[1]-1)
    v=np.clip(v.astype('int32'),0,tex.shape[0]-1)
    sampled=tex[v,u]
    intensity=(xx*L[0]-yy*L[1]+zz*L[2])/(np.sqrt(L[0]**2+L[1]**2+L[2]**2))
    shading=.19+.82*np.clip((intensity+.1)/1.05,0,1)
    limb=np.clip((1-zz)**2.9,0,1)
    ambient=np.array({'saturn':[184,152,106],'luna':[161,169,174],'mars':[189,91,51],'europa':[182,197,210],'titan':[179,112,60]}[name],dtype=np.float32)
    pix=np.clip(sampled*shading[:,:,None]+limb[:,:,None]*ambient[None,None,:]*.11,0,255)
    alpha=(mask.astype(np.uint8)*255)
    rgba=np.concatenate([pix.astype('uint8'),alpha[:,:,None]],axis=2)
    return Image.fromarray(rgba,'RGBA')

def rings(size,center,front=False):
    # Painter's algorithm: back half behind sphere, front half in front.
    layer=Image.new('RGBA',size,(0,0,0,0));d=ImageDraw.Draw(layer,'RGBA')
    cx,cy=center
    bands=[(1.49,19,(173,153,120,56)),(1.56,10,(204,183,148,80)),(1.65,17,(170,153,127,76)),(1.74,22,(224,201,164,76)),(1.84,15,(187,175,157,58)),(1.94,12,(205,186,160,44)),(2.03,8,(220,198,170,36))]
    for k,w,color in bands:
        pts=[]
        for i in range(300):
            a=(i/299)*(np.pi if not front else np.pi)+ (np.pi if front else 0)
            px=k*575*np.cos(a)
            py=k*157*np.sin(a)
            xx=cx+px*np.cos(.29)-py*np.sin(.29)
            yy=cy+px*np.sin(.29)+py*np.cos(.29)
            pts.append((round(xx),round(yy)))
        d.line(pts,fill=color,width=w,joint='curve')
    return layer.filter(ImageFilter.GaussianBlur(.9))

positions=[(350,180,43),(790,150,35),(1190,165,42),(1460,200,34)]
for current in ['luna','mars','europa','saturn','titan']:
    canvas=STARS.copy().convert('RGBA')
    # Small depth-layered celestial bodies.
    others=[i for i in ['luna','mars','europa','saturn','titan'] if i!=current]
    for n,(px,py,rr) in zip(others,positions):
        img=planet(n,rr*2)
        canvas.alpha_composite(img,(px-rr,py-rr))
    cx=1020 if current in ('saturn','mars') else 1110
    cy=1000 if current in ('saturn','luna') else 955
    radius=695 if current=='saturn' else 655
    if current=='saturn':canvas=Image.alpha_composite(canvas,rings((W,H),(cx,cy),False))
    img=planet(current,radius*2)
    canvas.alpha_composite(img,(cx-radius,cy-radius))
    if current=='saturn':canvas=Image.alpha_composite(canvas,rings((W,H),(cx,cy),True))
    # Cinematic bottom and left shadow keeps real interface copy readable.
    ve=np.zeros((H,W,4),dtype=np.uint8)
    ys=np.arange(H)[:,None]
    xs=np.arange(W)[None,:]
    left=(np.clip(1-xs/760,0,1)**1.5)*.38
    bottom=(np.clip((ys-800)/250,0,1)**1.5)*.58
    alpha=np.clip(left+bottom,0,.82)
    ve[:,:,3]=(alpha*255).astype('uint8')
    canvas.alpha_composite(Image.fromarray(ve,'RGBA'))
    canvas.convert('RGB').save(P/f'hero-{current}.webp','WEBP',quality=85,method=6)
    print('rendered',current)
