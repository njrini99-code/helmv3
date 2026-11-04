def h(c):
    c=c.lstrip('#'); return tuple(int(c[i:i+2],16)/255 for i in (0,2,4))
def lin(v): return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
def L(c): r,g,b=[lin(x) for x in c]; return .2126*r+.7152*g+.0722*b
def mix(fg,a,bg): return tuple(f*a+b*(1-a) for f,b in zip(fg,bg))
def cr(a,b):
    la,lb=sorted([L(a),L(b)],reverse=True); return (la+.05)/(lb+.05)
LT=dict(bg='#F2F0E9',card='#FFFEFB',well='#F6F4EE',ink='#1C1B18',ink2='#46433D',ink3='#5F5C55',gain='#14613D',loss='#9A5700',accent='#155A39',feat='#0B3A25',fink='#F4F1E8',fink2='#D3D9CB',fgain='#8FD3AA',floss='#EDB867',btn='#F6F1E3',flag='#B3261E',nav='#0a331f',navink='#f4eedd',champ='#d9c48f',gainf='#1F6B45',lossf='#B86F0C',neuf='#6B675F',track='#EBE5D8',dnav='#0a331f')
DK=dict(bg='#0E120F',card='#191E1A',well='#141815',ink='#F1ECDF',ink2='#D0C9B8',ink3='#ADA697',gain='#7CC79B',loss='#E7AE57',accent='#7CC79B',feat='#123D29',fink='#F4F1E8',fink2='#D3D9CB',fgain='#8FD3AA',floss='#EDB867',btn='#0E120F',flag='#F28B7D',nav='#08150e',navink='#f4eedd',champ='#d9c48f',gainf='#4FA877',lossf='#E09A35',neuf='#A39D90',track='#2C322D',dnav='#08150e')
rows=[('Body text','ink','card'),('Secondary text','ink2','card'),('Tertiary text, chevrons','ink3','card'),('Secondary on well (tinted panels)','ink2','well'),('Tertiary on page','ink3','bg'),
('Loss figures on card','loss','card'),('Gain figures on card','gain','card'),('Accent links on card','accent','card'),('Assign button label','btn','accent'),
('Feature card ink','fink','feat'),('Feature card secondary','fink2','feat'),('Stance chip on feature (amber over 12% tint)','floss','feat*floss.12'),('Counted chip on feature','fgain','feat*fgain.12'),('Tier chip on feature (12% light tint)','fink','feat*fink.12'),
('Bar title on green bar','navink','nav'),('Back label (champagne) on green bar','champ','nav'),
('Notice and verdict text on well','ink','well'),('Accent on well (link chips, Undo)','accent','well'),('Tertiary on well (stepper off labels)','ink3','well'),
('Error code (mono) on card','ink3','card'),('Dismiss (flag red) on card and sheet','flag','card'),
('Selected correction chip (accent on 12% accent)','accent','card*accent.12'),('Assigned chip (gain on 12% gain)','gain','card*gain.12'),
('Desk rail open row (ink on 9% accent)','ink','card*accent.09'),('Desk rail open row secondary','ink2','card*accent.09'),
('NON-TEXT loss bar on track (3:1)','lossf','track'),('NON-TEXT neutral bar on track (3:1)','neuf','track'),('NON-TEXT gain bar on track (3:1)','gainf','track'),
('NON-TEXT loss dot on card (3:1)','lossf','card'),('NON-TEXT path node ring on well (3:1)','neuf','well')]
for name,T in (('Light',LT),('Dark',DK)):
    print('##',name)
    for lab,f,b in rows:
        fg=h(T[f])
        if '*' in b:
            base,rest=b.split('*'); tint,a=rest.split('.'); a=float('.'+a)
            bg=mix(h(T[tint]),a,h(T[base]))
        else: bg=h(T[b])
        print(f'{lab:48s} {T[f]} on {b:18s} {cr(fg,bg):5.2f}')
