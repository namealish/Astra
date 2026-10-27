"""Offline illustration assets for ASTRAEA (locally bundled, original artwork)."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import numpy as np, random
P=Path(__file__).resolve().parent.parent/'assets'
random.seed(55)
W,H=1920,1080
# Faint, richly layered stars / no photograph needed
bg=Image.new('RGB',(W,H),(3,8,15))
base=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(base)
for _ in range(280):
 x=random.randint(0,W-1);y=random.randint(0,H-1);r=random.choices([.45,.7,1.1,1.6],[.52,.28,.16,.04])[0]
 a=random.randint(45,170)
 d.ellipse((x-r,y-r,x+r,y+r),fill=(194,210,231,a))
for x,y in [(181,102),(448,217),(909,120),(1410,287),(1711,104),(1229,93)]:
 d.ellipse((x-2,y-2,x+2,y+2),fill=(244,233,212,230))
 d.line((x-8,y,x+8,y),fill=(241,226,206,62),width=1)
 d.line((x,y-8,x,y+8),fill=(241,226,206,62),width=1)
bg=Image.alpha_composite(bg.convert('RGBA'),base).convert('RGB')
bg.save(P/'starfield.webp','WEBP',quality=84)

# ship card art as original layered SVGs, all local and scalable.
ships=[
 ('astraea-one', '#e2d6bc','#101d29','0.0','Interplanetary flagship'),
 ('celeste','#e8edea','#141b27','0.15','Orbital transport'),
 ('aurelia','#d9bd91','#171c25','-0.08','Private charter'),
]
for key,hull,bgcolor,turn,description in ships:
 variation={'astraea-one':1.0,'celeste':.78,'aurelia':.64}[key]
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
<defs>
 <radialGradient id="sky"><stop stop-color="#253744"/><stop offset=".6" stop-color="#0a121b"/><stop offset="1" stop-color="#05090f"/></radialGradient>
 <linearGradient id="body" x1="0" x2=".15" y1="0" y2="1"><stop stop-color="#fffdf1"/><stop offset=".28" stop-color="{hull}"/><stop offset=".55" stop-color="#8d8d89"/><stop offset=".8" stop-color="#353b43"/><stop offset="1" stop-color="#101722"/></linearGradient>
 <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#a4b0b3"/><stop offset=".48" stop-color="#27333e"/><stop offset="1" stop-color="#060b12"/></linearGradient>
 <linearGradient id="beam" x1="0" x2="1"><stop stop-color="#b8a47b" stop-opacity="0"/><stop offset=".6" stop-color="#fff0c6" stop-opacity=".35"/><stop offset="1" stop-color="#fff0c6" stop-opacity="0"/></linearGradient>
 <filter id="glow"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<rect width="1000" height="700" fill="url(#sky)"/>
<circle cx="780" cy="110" r="230" fill="#6c655b" opacity=".12"/>
<circle cx="780" cy="110" r="228" fill="none" stroke="#b8c1bb" stroke-opacity=".18"/>
<path d="M 0 580 Q 510 610 1000 450 L 1000 700 L 0 700" fill="#05080d" opacity=".64"/>
<g fill="#e1f0ff" opacity=".65"><circle cx="124" cy="91" r="1.1"/><circle cx="347" cy="145" r="1"/><circle cx="620" cy="78" r="1.5"/><circle cx="918" cy="278" r="1"/><circle cx="745" cy="358" r="1"/></g>
<ellipse cx="482" cy="475" rx="385" ry="37" fill="#f2d9ad" opacity=".18" filter="url(#glow)"/>
<!-- wing-like silhouette -->
<path d="M 215 393 Q 445 323 778 383 Q 825 405 778 426 Q 440 467 215 412 Z" fill="url(#body)" stroke="#d3c9b4" stroke-width="1"/>
<path d="M 250 400 Q 455 363 727 393 Q 762 406 727 416 Q 462 443 250 409 Z" fill="url(#glass)" stroke="#bdab88" stroke-width="2"/>
<path d="M 300 419 Q 448 449 688 424" stroke="#decaa5" stroke-opacity=".75" stroke-width="2.5" fill="none"/>
<path d="M 398 377 Q 447 332 569 354 Q 593 368 606 386 Z" fill="url(#body)" stroke="#c7b99e"/>
<path d="M 418 373 Q 461 347 547 359 Q 559 363 572 375 Z" fill="url(#glass)"/>
<path d="M 313 421 Q 284 458 227 484 Q 359 448 410 432" fill="url(#body)" stroke="#d2be9b" stroke-width="1"/>
<path d="M 681 412 Q 743 450 790 459 Q 757 432 730 401" fill="url(#body)" stroke="#d2be9b" stroke-width="1"/>
<path d="M 254 394 Q 266 389 277 386" stroke="#fff4d3" stroke-width="2"/>
<path d="M 253 407 Q 450 429 745 400" stroke="#f6daab" stroke-opacity=".55" stroke-width="1" fill="none"/>
<path d="M 290 413 Q 482 444 717 415" stroke="#d7ba8c" stroke-opacity=".7" stroke-width="2" fill="none"/>
<g fill="#f4d4a0">'''
 for i in range(32):
  x=317+i*12;y=406+int(13*np.sin(i/32*np.pi))
  svg+=f'<rect x="{x}" y="{y}" width="4" height="2" rx="1" opacity=".6"/>'
 svg+='''</g>
<path d="M 110 402 H 890" stroke="url(#beam)" stroke-width="2"/>
<text x="50" y="645" font-family="Arial" font-size="12" letter-spacing="5" fill="#e3c795" opacity=".8">ASTRAEA FLEET / 2086</text>
</svg>'''
 (P/f'{key}.svg').write_text(svg,encoding='utf8')

# Illustrated editorial crew cards, not synthetic real-person likenesses.
profiles=[('elena-vale','#c3a184','#171b23','female'),('james-orion','#af8b73','#1c262d','male'),('maya-chen','#d5aa82','#1b252b','female')]
for i,(name,skin,bg,gender) in enumerate(profiles):
 hair=('#332720' if i<2 else '#181918')
 shoulder = 'M 150 520 Q 190 395 318 396 Q 443 395 480 520 L 480 680 L 150 680 Z'
 svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="630" height="780" viewBox="0 0 630 780">
<defs><radialGradient id="bg"><stop stop-color="#39444b"/><stop offset="1" stop-color="{bg}"/></radialGradient>
<linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#526470"/><stop offset=".48" stop-color="#18252f"/><stop offset="1" stop-color="#070d13"/></linearGradient>
<linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ebc7a6"/><stop offset=".47" stop-color="{skin}"/><stop offset="1" stop-color="#805b49"/></linearGradient>
</defs>
<rect width="630" height="780" fill="url(#bg)"/>
<circle cx="470" cy="126" r="245" fill="#97a1a3" opacity=".05"/>
<path d="M 0 660 Q 315 600 630 658 L 630 780 L 0 780" fill="#071017" opacity=".55"/>
<path d="M 94 660 Q 150 492 257 482 L 318 468 L 379 484 Q 507 495 540 660 L 570 780 L 55 780 Z" fill="url(#coat)"/>
<path d="M 251 489 L 317 605 L 378 488 L 351 473 L 283 473 Z" fill="#e1d9ca"/>
<path d="M 297 564 L 315 615 L 334 563 L 320 545 Z" fill="#b29b76"/>
<path d="M 283 453 L 282 517 Q 318 543 349 514 L 347 453 Z" fill="url(#face)"/>
<ellipse cx="316" cy="339" rx="111" ry="147" fill="url(#face)"/>
<path d="M 207 344 Q 190 236 244 202 Q 317 150 390 211 Q 423 246 422 336 Q 399 283 385 259 Q 353 229 317 233 Q 261 234 221 284 Z" fill="{hair}"/>
<path d="M 212 312 Q 222 252 248 251 L 243 367 Q 226 397 213 354 Z" fill="{hair}" opacity=".95"/>
<path d="M 399 282 Q 423 312 411 369 L 393 390 L 396 285 Z" fill="{hair}"/>
<path d="M 258 346 Q 279 338 292 345" stroke="#433126" stroke-width="3" fill="none"/>
<path d="M 344 346 Q 365 339 381 347" stroke="#433126" stroke-width="3" fill="none"/>
<circle cx="278" cy="350" r="3" fill="#202224"/><circle cx="360" cy="350" r="3" fill="#202224"/>
<path d="M 317 352 L 308 399 Q 317 407 327 401" stroke="#7c594c" stroke-width="2" fill="none" opacity=".55"/>
<path d="M 281 433 Q 314 448 350 430" stroke="#6d4540" stroke-width="3" fill="none"/>
<path d="M 228 480 Q 258 481 288 526 L 246 601 L 199 517" fill="#2b3d48" stroke="#89939a" stroke-width="1"/>
<path d="M 407 482 Q 371 485 347 526 L 388 601 L 436 520" fill="#26333d" stroke="#89939a" stroke-width="1"/>
<path d="M 418 550 H 475" stroke="#c5a979" stroke-width="3"/>
<circle cx="431" cy="533" r="5" fill="#d1b685"/>
<text x="40" y="737" font-family="Arial" font-size="10" letter-spacing="5" fill="#ded3c3" opacity=".6">ASTRAEA / COMMAND &amp; SERVICE</text>
</svg>'''
 (P/f'crew-{name}.svg').write_text(svg,encoding='utf8')
print('created vector brand art')
