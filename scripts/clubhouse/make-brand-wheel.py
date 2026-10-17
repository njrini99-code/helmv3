# Builds public/clubhouse/brand/helm-wheel-sidebar.png, the sidebar brand's wheel (P001), from the 300px logo:
#   python3 -I scripts/clubhouse/make-brand-wheel.py public/anim/helm-golf-icon.png public/clubhouse/brand/helm-wheel-sidebar.png "#7bc79a" 9 96 "#1d5a3b"
# Recolours white to ivory and green to the given green, traces an ivory outline (radius in source px), squares and
# resizes to the given size (3x the 32px it is drawn at). The optional last colour fills the light areas other than
# the ball's face.
import sys
from PIL import Image, ImageFilter
src, out, green, outline_px, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
fill = sys.argv[6] if len(sys.argv) > 6 else None
IVORY=(244,238,221)
hexrgb=lambda h: tuple(int(h[i:i+2],16) for i in (1,3,5))
G=hexrgb(green)
F=hexrgb(fill) if fill else IVORY
im=Image.open(src).convert('RGBA')
# pad so the outline has room
pad=outline_px+4
W=im.width+2*pad
base=Image.new('RGBA',(W,W),(0,0,0,0)); base.paste(im,(pad,pad))
r,g,b,a=base.split()
# recolour: white -> ivory, green -> matte green, by how far the red channel is from white
px=base.load()
# The ball's face: the light pixels reachable from the centre. Every other light area (the gap between ball and rim)
# takes the fill colour, so the wheel reads solid rather than as an ivory blob.
face=set(); stack=[(W//2,W//2)]
while stack:
    x,y=stack.pop()
    if (x,y) in face or not (0<=x<W and 0<=y<W): continue
    R,_,_,A=px[x,y]
    if A==0 or R<128: continue
    face.add((x,y)); stack+= [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
rec=Image.new('RGBA',base.size,(0,0,0,0)); rp=rec.load()
for y in range(W):
    for x in range(W):
        R,Gc,B,A=px[x,y]
        if A==0: continue
        t=max(0.0,min(1.0,(255-R)/254))
        light=IVORY if (x,y) in face or R<128 else F
        rp[x,y]=tuple(int(light[i]*(1-t)+G[i]*t) for i in range(3))+(A,)
# outline: dilate the alpha
dil=a.filter(ImageFilter.MaxFilter(outline_px*2+1)).filter(ImageFilter.GaussianBlur(0.8))
ol=Image.new('RGBA',base.size,IVORY+(0,)); ol.putalpha(dil)
comp=Image.alpha_composite(ol,rec)
bbox=comp.getbbox(); comp=comp.crop(bbox)
s=max(comp.size); sq=Image.new('RGBA',(s,s),(0,0,0,0)); sq.paste(comp,((s-comp.width)//2,(s-comp.height)//2))
sq.resize((size,size),Image.LANCZOS).save(out,optimize=True)
