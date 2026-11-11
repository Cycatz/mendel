// Starter genomes. They share one gene set (one "genus"), so crosses pair up homologous loci,
// but their alleles differ enough to give very different body plans.
export const FERNWORT = `plant "Fernwort"
axiom A
root R

chromosome 1
  rule BLOOM @5 : E/l
    E dom 2 = A when step >= $BLOOM_AGE -> F(0.25) F(0.25) @flower
    l = A when step >= $BLOOM_AGE + 4 -> F(0.25) @flower
  rule APEX @20 : Fe/Fe
    Fe = A -> F ~(6) [ &(50) @leaf ] /($PHYLLO) A
  rule LATERAL @45 : 0/0
  rule FRUITING @50 : 0/0
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : a/a
    a = 40
  num PHYLLO @70 : g/g
    g = 137.5
  num INTERNODE @85 : i/i
    i = 0.3

chromosome 2
  organ leaf @10 : C/s
    C dom 2 = chain(leaflet, n=7, spacing=0.11, angle=70, shrink=0.88, tip=1)
    s = scale(leaflet, s=2.6)
  organ leaflet @20 : p/p
    p = blade(sf(m=2, n1=1.2, n2=1.6, n3=1.6), length=0.22, width=0.08, curl=0.15, fold=0.3,
              color=hsl($LEAF_HUE, 0.55, 0.32))
  organ flower @50 : W/W
    W = group(whorl(petal, n=$PETALS, tilt=55), bulb(length=0.08, radius=0.05, color=hsl(0.14, 0.9, 0.55)))
  num PIGMENT @55 : P/w
    P dom 2 = 0.75
    w = 0.04
  num PETAL_HUE @58 : v/v
    v = 0.78
  organ petal @60 : r/r
    r = blade(sf(m=1, n1=0.5, n2=0.8, n3=0.8), length=0.3, width=0.18, curl=-0.2,
              color=hsl($PETAL_HUE, $PIGMENT, 0.62))
  num PETALS @65 : f/f
    f = 5
  organ fruit @80 : o/o
    o = bulb(length=0.25, radius=0.08, point=1.4, color=hsl(0.08, 0.6, 0.4))

chromosome 3
  num TROPISM @10 : t/t
    t = 0.12
  num STEM_W @30 : sw/sw
    sw = 0.025
  num RESERVE @20 : r/r
    r = 3
  num ALLOC @40 : al/al
    al = 0.7
  num SHADE_TOL @50 : st/st
    st = 0.25
  num APICAL @70 : ap/ap
    ap = 0.8
  num BLOOM_AGE @60 : e/e
    e = 9
  num TAPER @80 : k/k
    k = 0.6
  num LEAF_HUE @90 : h/h
    h = 0.3

chromosome 4   # temperature tolerance: frost-hardy cool specialist
  num T_OPT @10 : cf/cf
    cf = 16
  num T_WIDTH @30 : nf/nf
    nf = 10
  num T_LETHAL_LO @55 : hf/hf
    hf = -4
  num T_LETHAL_HI @80 : sf/sf
    sf = 34

chromosome 5   # roots: shallow and fibrous
  rule ROOT_APEX @10 : Rf/Rf
    Rf = R when depth < $ROOT_DEPTH -> F(0.06) [ &(75) Q ] /(120) [ &(75) Q ] /(120) R
  rule ROOT_LATERAL @30 : Lf/Lf
    Lf = Q when x < 4 -> F(0.05) [ &(40) @rootlet ] [ ^(40) @rootlet ] Q(x + 1)
  organ rootlet @50 : hf/hf
    hf = rootlet(length=0.05, radius=0.0025, hairs=3)
  num ROOT_DEPTH @60 : df/df
    df = 0.3
  num ROOT_ALLOC @70 : af/af
    af = 0.2
  num ROOT_GRAV @85 : gf/gf
    gf = 0.1
`;

// A broadleaf tree: a straight bole that forks into three limbs, each branching four times
// and ending in rosettes of leaves and acorn-like nuts.
export const OAKHART = `plant "Oakhart"
axiom A
root R

chromosome 1
  rule BLOOM @5 : 0/0
  rule APEX @20 : Ot/Ot   # the bole
    Ot = A when step < 4 -> F(0.35) !(0.95) F(0.35) !(0.95) F(0.35) ~(2) A   # tapers as it rises (age thickens the older stretch below)
  rule CROWN @40 : Oc/Oc   # forks into three limbs
    Oc = A -> F(0.6) [ &(34) B(0) ] /(120) [ &(40) B(0) ] /(120) [ &(30) B(0) ] /(60) [ ^(5) B(1) ]
  rule LATERAL @45 : Ob/Ob
    Ob = B when x < 4 -> F(1.15 - 0.2 * x) ~(10) [ &(65) @leaf(1.2) ] [ &(40) B(x + 1) ] /(137.5) ~(8) B(x + 1)
  rule FRUITING @50 : On/0
    On dom 2 = B when x >= 4 -> F(0.25) @leaf(1.5) [ &(70) @fruit(1.5) ]
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : ao/ao
    ao = 35
  num PHYLLO @70 : go/go
    go = 137.5
  num INTERNODE @85 : io/io
    io = 0.5

chromosome 2
  organ leaf @10 : Ro/Ro   # a rosette at each twig end
    Ro = spiral(leaflet, n=7, height=0.25, tilt=65, shrink=0.96)   # a leafy spray at each twig end
  organ leaflet @20 : Lo/Lo
    Lo = blade(sf(m=2, n1=0.7, n2=1, n3=1), length=0.28, width=0.14, curl=-0.12, fold=0.15, stalk=0.03,
               color=hsl($LEAF_HUE, 0.5, 0.38))
  organ flower @50 : 0/0
  num PIGMENT @55 : Po/Po
    Po = 0.5
  num PETAL_HUE @58 : vo/vo
    vo = 0.1
  organ petal @60 : 0/0
  num PETALS @65 : fo/fo
    fo = 0
  organ fruit @80 : Nu/Nu
    Nu = group(bulb(length=0.07, radius=0.03, point=0.8, color=hsl(0.09, 0.55, 0.38)),
               bulb(length=0.03, radius=0.035, point=0.5, color=hsl(0.08, 0.3, 0.3)))

chromosome 3
  num TROPISM @10 : to/to
    to = 0.1
  num STEM_W @30 : swo/swo
    swo = 0.2
  num RESERVE @20 : ro/ro
    ro = 12
  num ALLOC @40 : alo/alo
    alo = 0.5
  num SHADE_TOL @50 : sto/sto
    sto = 0.4
  num APICAL @70 : apo/apo
    apo = 0.6
  num BLOOM_AGE @60 : eo/eo
    eo = 99
  num TAPER @80 : ko/ko
    ko = 0.6
  num LEAF_HUE @90 : ho/ho
    ho = 0.28

chromosome 4   # temperature tolerance: temperate, frost-hardy
  num T_OPT @10 : co/co
    co = 17
  num T_WIDTH @30 : no/no
    no = 13
  num T_LETHAL_LO @55 : lo/lo
    lo = -20
  num T_LETHAL_HI @80 : so/so
    so = 38

chromosome 5   # roots: a stout taproot with spreading laterals
  rule ROOT_APEX @10 : Ro/Ro
    Ro = R when depth < $ROOT_DEPTH -> F(0.27) [ &(70) Q ] /(120) [ &(70) Q ] /(120) [ &(70) Q ] R
  rule ROOT_LATERAL @30 : Lo/Lo
    Lo = Q when x < 4 -> F(0.22) ~(15) [ &(40) @rootlet ] [ ^(35) Q(x + 2) ] Q(x + 1)
  organ rootlet @50 : ro/ro
    ro = rootlet(length=0.14, radius=0.007, hairs=2)
  num ROOT_DEPTH @60 : do/do
    do = 1.6
  num ROOT_ALLOC @70 : af/af
    af = 0.35
  num ROOT_W @80 : rw/rw   # roots as stout as the bole they hold up
    rw = 0.045
  num ROOT_GRAV @85 : gr/gr
    gr = 0.2
`;

// A sunflower-like composite: one tall leafy stalk whose head nods under a ring of rays.
export const SUNRAY = `plant "Sunray"
axiom A
root R

chromosome 1
  rule BLOOM @5 : Su/Su
    Su dom 2 = A when step >= $BLOOM_AGE -> F(0.2) /(360 - $BLOOM_AGE * $PHYLLO % 360) ^(70) F(0.1) @flower(1.25)   # undo the phyllotaxis roll, then face the sun
  rule APEX @20 : Sa/Sa
    Sa = A -> F ~(4) [ &(58) @leaf ] /($PHYLLO) A
  rule LATERAL @45 : 0/0
  rule FRUITING @50 : 0/0
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : au/au
    au = 35
  num PHYLLO @70 : gu/gu
    gu = 137.5
  num INTERNODE @85 : iu/iu
    iu = 0.22

chromosome 2
  organ leaf @10 : Hl/Hl
    Hl = blade(heart(), length=0.4, width=0.32, curl=-0.25, fold=0.15, wave=0.3, stalk=0.08,
               color=hsl($LEAF_HUE, 0.5, 0.33))
  organ leaflet @20 : pu/pu
    pu = blade(ellipse(), length=0.1, width=0.05, color=hsl($LEAF_HUE, 0.5, 0.33))
  organ flower @50 : Hd/Hd   # two rings of rays round a dark seeded disc
    Hd = group(whorl(petal, n=$PETALS, tilt=84), whorl(scale(petal, s=0.85), n=$PETALS, tilt=74, twist=9),
               whorl(leaflet, n=10, tilt=95),
               bulb(length=0.06, radius=0.15, point=0.35, ribs=16, ribdepth=0.05, color=hsl(0.07, 0.6, 0.22)))
  num PIGMENT @55 : Pu/Pu
    Pu dom 2 = 0.95
  num PETAL_HUE @58 : yu/yu
    yu = 0.12
  organ petal @60 : Ra/Ra
    Ra = blade(sf(m=1, n1=0.6, n2=0.9, n3=0.9), length=0.24, width=0.07, curl=-0.12,
               color=hsl($PETAL_HUE, $PIGMENT, 0.55))
  num PETALS @65 : fu/fu
    fu = 21
  organ fruit @80 : 0/0

chromosome 3
  num TROPISM @10 : tu/tu
    tu = 0.25
  num STEM_W @30 : swu/swu
    swu = 0.014
  num RESERVE @20 : ru/ru
    ru = 4
  num ALLOC @40 : alu/alu
    alu = 0.75
  num SHADE_TOL @50 : stu/stu
    stu = 0.1
  num APICAL @70 : apu/apu
    apu = 1
  num BLOOM_AGE @60 : eu/eu
    eu = 9
  num TAPER @80 : ku/ku
    ku = 0.6
  num LEAF_HUE @90 : hu/hu
    hu = 0.29

chromosome 4   # temperature tolerance: a summer annual
  num T_OPT @10 : cu/cu
    cu = 24
  num T_WIDTH @30 : nu/nu
    nu = 10
  num T_LETHAL_LO @55 : lu/lu
    lu = 1
  num T_LETHAL_HI @80 : su/su
    su = 40

chromosome 5   # roots: a taproot with short laterals
  rule ROOT_APEX @10 : Ru/Ru
    Ru = R when depth < $ROOT_DEPTH -> F(0.09) [ &(60) Q ] /(137.5) R
  rule ROOT_LATERAL @30 : Lu/Lu
    Lu = Q when x < 3 -> F(0.06) [ &(40) @rootlet ] Q(x + 1)
  organ rootlet @50 : ru/ru
    ru = rootlet(length=0.06, radius=0.003, hairs=2)
  num ROOT_DEPTH @60 : du/du
    du = 0.7
  num ROOT_ALLOC @70 : au/au
    au = 0.25
  num ROOT_GRAV @85 : gu/gu
    gu = 0.4
`;

// A trained grape vine: a short trunk, two cordons along a (notional) wire, and upright canes
// with lobed leaves and coiled tendrils. Bunches hang from the cordons.
export const VINEWOOD = `plant "Vinewood"
axiom A
root R

chromosome 1
  rule BLOOM @5 : 0/0
  rule APEX @20 : Vt/Vt   # the trunk
    Vt = A when step < 3 -> F(0.4) ~(2) A   # staked straight
  rule CROWN @40 : Vc/Vc   # splits into two cordons
    Vc = A -> [ &(88) C(0) ] /(180) [ &(88) C(0) ]
  rule LATERAL @45 : Vk/Vk   # cordon: a cane and a bunch at each spur
    Vk = C when x < 4 -> F(0.32) ~(3) [ ^(68) ~(6) S(0) ] [ &(90) F(0.05) @fruit ] C(x + 1)
  rule FRUITING @50 : Vs/Vs   # cane: arching, with alternate leaves, each opposite a tendril
    Vs = S when x < 6 -> F(0.17) ~(7) &(5) [ +(60) @leaf ] [ -(50) @leaflet ] F(0.17) ~(7) &(5) [ -(60) @leaf ] [ +(50) @leaflet ] S(x + 2)
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : av/av
    av = 40
  num PHYLLO @70 : gv/gv
    gv = 180
  num INTERNODE @85 : iv/iv
    iv = 0.3

chromosome 2
  organ leaf @10 : Gl/Gl
    Gl = blade(lobed(n=5, depth=0.12), length=0.3, width=0.32, curl=-0.25, fold=0.15, wave=0.45, stalk=0.08,
               color=hsl($LEAF_HUE, 0.45, 0.36))   # broad, shallowly lobed, toothed
  organ leaflet @20 : Td/Td   # a tendril
    Td = spike(length=0.14, radius=0.003, bend=3, color=hsl(0.22, 0.4, 0.45))
  organ flower @50 : 0/0
  num PIGMENT @55 : Pv/Pv
    Pv dom 2 = 0.55
  num PETAL_HUE @58 : yv/yv
    yv = 0.76
  organ petal @60 : 0/0
  num PETALS @65 : fv/fv
    fv = 0
  organ fruit @80 : Bn/Bn   # a tapering bunch of berries
    Bn = spiral(offset(bulb(length=0.045, radius=0.022, point=0.55, color=hsl($PETAL_HUE, $PIGMENT, 0.3)), y=0.012),
                n=34, height=0.24, tilt=78, shrink=0.985)

chromosome 3
  num TROPISM @10 : tv/tv
    tv = 0.04
  num STEM_W @30 : swv/swv
    swv = 0.022
  num RESERVE @20 : rv/rv
    rv = 8
  num ALLOC @40 : alv/alv
    alv = 0.55
  num SHADE_TOL @50 : stv/stv
    stv = 0.3
  num APICAL @70 : apv/apv
    apv = 0.5
  num BLOOM_AGE @60 : ev/ev
    ev = 99
  num TAPER @80 : kv/kv
    kv = 0.65
  num LEAF_HUE @90 : hv/hv
    hv = 0.27

chromosome 4   # temperature tolerance: warm-temperate
  num T_OPT @10 : cv/cv
    cv = 22
  num T_WIDTH @30 : nv/nv
    nv = 12
  num T_LETHAL_LO @55 : lv/lv
    lv = -12
  num T_LETHAL_HI @80 : sv/sv
    sv = 42

chromosome 5   # roots: deep and wiry
  rule ROOT_APEX @10 : Rv/Rv
    Rv = R when depth < $ROOT_DEPTH -> F(0.12) ~(10) [ &(45) Q ] /(137.5) R
  rule ROOT_LATERAL @30 : Lv/Lv
    Lv = Q when x < 3 -> F(0.08) [ &(35) @rootlet ] Q(x + 1)
  organ rootlet @50 : rv/rv
    rv = rootlet(length=0.07, radius=0.003, hairs=1.5)
  num ROOT_DEPTH @60 : dv/dv
    dv = 1
  num ROOT_ALLOC @70 : av/av
    av = 0.3
  num ROOT_GRAV @85 : gv/gv
    gv = 0.5
`;

// A bamboo: a single culm of jointed internodes, with fans of narrow
// leaves on short branches at the upper nodes.
export const CANEBRAKE = `plant "Canebrake"
axiom A
root R

chromosome 1
  rule BLOOM @5 : 0/0
  rule APEX @20 : Bc/Bc   # the rhizome sends up a single culm
    Bc = A -> C(0)
  rule CROWN @40 : Bn/Bn   # culm, branching at the upper nodes
    Bn = C when x >= 4 and x < 13 -> @culm F ~(3) [ &(50) B(0) ] /(180) [ &(58) B(1) ] /(90) C(x + 1)
  rule LATERAL @45 : Bk/Bk   # culm, bare below
    Bk = C when x < 4 -> @culm F ~(2) /(150) C(x + 1)
  rule FRUITING @50 : Bb/Bb   # branch: a fan of leaves at each joint
    Bb = B when x < 4 -> F(0.12) [ +(45) @leaf ] [ -(45) @leaf ] [ &(30) @leaf ] B(x + 1)
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : ab/ab
    ab = 30
  num PHYLLO @70 : gb/gb
    gb = 180
  num INTERNODE @85 : ib/ib
    ib = 0.36

chromosome 2
  organ leaf @10 : Bl/Bl
    Bl = blade(sf(m=2, n1=0.5, n2=0.9, n3=0.9), length=0.34, width=0.065, curl=-0.3, fold=0.15,
               color=hsl($LEAF_HUE, 0.5, 0.48))
  organ culm @15 : Cu/Cu   # one internode; the pinched ends read as the joints
    Cu = bulb(length=$INTERNODE, radius=0.04, point=0.07, color=hsl($LEAF_HUE, 0.45, 0.42))
  organ leaflet @20 : pb/pb
    pb = blade(ellipse(), length=0.1, width=0.02, color=hsl($LEAF_HUE, 0.5, 0.36))
  organ flower @50 : 0/0
  num PIGMENT @55 : Pb/Pb
    Pb = 0.3
  num PETAL_HUE @58 : yb/yb
    yb = 0.2
  organ petal @60 : 0/0
  num PETALS @65 : fb/fb
    fb = 0
  organ fruit @80 : 0/0

chromosome 3
  num TROPISM @10 : tb/tb
    tb = 0.08
  num STEM_W @30 : swb/swb
    swb = 0.012
  num RESERVE @20 : rb/rb
    rb = 6
  num ALLOC @40 : alb/alb
    alb = 0.7
  num SHADE_TOL @50 : stb/stb
    stb = 0.35
  num APICAL @70 : apb/apb
    apb = 0.95
  num BLOOM_AGE @60 : eb/eb
    eb = 99
  num TAPER @80 : kb/kb
    kb = 0.75
  num LEAF_HUE @90 : hb/hb
    hb = 0.25

chromosome 4   # temperature tolerance: subtropical
  num T_OPT @10 : cb/cb
    cb = 24
  num T_WIDTH @30 : nb/nb
    nb = 12
  num T_LETHAL_LO @55 : lb/lb
    lb = -5
  num T_LETHAL_HI @80 : sb/sb
    sb = 42

chromosome 5   # roots: a dense fibrous mat
  rule ROOT_APEX @10 : Rb/Rb
    Rb = R when depth < $ROOT_DEPTH -> F(0.05) [ &(80) Q ] /(72) [ &(80) Q ] /(72) [ &(80) Q ] /(72) R
  rule ROOT_LATERAL @30 : Lb/Lb
    Lb = Q when x < 4 -> F(0.06) ~(20) [ &(40) @rootlet ] [ ^(40) @rootlet ] Q(x + 1)
  organ rootlet @50 : rb/rb
    rb = rootlet(length=0.05, radius=0.0025, hairs=3)
  num ROOT_DEPTH @60 : db/db
    db = 0.35
  num ROOT_ALLOC @70 : ab/ab
    ab = 0.25
  num ROOT_GRAV @85 : gb/gb
    gb = 0.15
`;

// A columnar cactus: a ribbed, spined trunk with two arms that turn upward, each crowned
// with a pale flower. The body is all green stem; it has no leaves.
export const PILLARSPINE = `plant "Pillarspine"
axiom A
root R

chromosome 1
  rule BLOOM @5 : Cb/Cb   # a flower crowns the trunk once it stops
    Cb dom 2 = A when step >= $BLOOM_AGE -> F(0.16) @flower
  rule APEX @20 : Ca/Ca   # trunk segments; two arms sprout part way up
    Ca = A when step == 3 -> @leaf F(0.3) [ &(85) G(0) ] /(180) [ &(85) G(2) ] A
  rule CROWN @40 : Cc/Cc
    Cc = A -> @leaf F(0.3) A
  rule LATERAL @45 : Cg/Cg   # an arm: out, then up
    Cg = G when x < 6 -> @leaf(0.72) F(0.22) ^(22) G(x + 1)
  rule FRUITING @50 : Cf/Cf
    Cf = G when x >= 6 -> F(0.12) @flower(0.8)
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : ac/ac
    ac = 30
  num PHYLLO @70 : gc/gc
    gc = 137.5
  num INTERNODE @85 : ic/ic
    ic = 0.3

chromosome 2
  organ leaf @10 : Sg/Sg   # a ribbed stem segment, spined along each rib
    Sg = group(bulb(length=0.44, radius=0.19, point=0.12, ribs=11, ribdepth=0.1, color=hsl($LEAF_HUE, 0.35, 0.36)),
               offset(whorl(leaflet, n=11, tilt=90), y=0.15), offset(whorl(leaflet, n=11, tilt=90, twist=4), y=0.3))
  organ leaflet @20 : Sp/Sp   # a spine
    Sp = spike(length=0.25, radius=0.006, color=hsl(0.12, 0.25, 0.8))
  organ flower @50 : Cw/Cw
    Cw = group(whorl(petal, n=$PETALS, tilt=50), whorl(scale(petal, s=0.8), n=$PETALS, tilt=30, twist=20),
               bulb(length=0.06, radius=0.04, color=hsl(0.14, 0.85, 0.6)))
  num PIGMENT @55 : Pc/Pc
    Pc dom 2 = 0.25
  num PETAL_HUE @58 : yc/yc
    yc = 0.95
  organ petal @60 : Wp/Wp
    Wp = blade(sf(m=1, n1=0.6, n2=0.8, n3=0.8), length=0.13, width=0.08, curl=-0.1,
               color=hsl($PETAL_HUE, $PIGMENT, 0.86))
  num PETALS @65 : fc/fc
    fc = 10
  organ fruit @80 : 0/0

chromosome 3
  num TROPISM @10 : tc/tc
    tc = 0.3
  num STEM_W @30 : swc/swc
    swc = 0.03
  num RESERVE @20 : rc/rc
    rc = 10
  num ALLOC @40 : alc/alc
    alc = 0.9
  num SHADE_TOL @50 : stc/stc
    stc = 0.05
  num APICAL @70 : apc/apc
    apc = 1
  num BLOOM_AGE @60 : ec/ec
    ec = 9
  num TAPER @80 : kc/kc
    kc = 0.75
  num LEAF_HUE @90 : hc/hc
    hc = 0.36

chromosome 4   # temperature tolerance: desert
  num T_OPT @10 : cc/cc
    cc = 30
  num T_WIDTH @30 : nc/nc
    nc = 14
  num T_LETHAL_LO @55 : lc/lc
    lc = -3
  num T_LETHAL_HI @80 : sc/sc
    sc = 52

chromosome 5   # roots: shallow and wide, to catch brief rain
  rule ROOT_APEX @10 : Rc/Rc
    Rc = R when depth < $ROOT_DEPTH -> F(0.06) [ &(85) Q ] /(72) [ &(85) Q ] /(72) [ &(85) Q ] /(72) [ &(85) Q ] R
  rule ROOT_LATERAL @30 : Lc/Lc
    Lc = Q when x < 6 -> F(0.12) ~(10) [ &(35) @rootlet ] Q(x + 1)
  organ rootlet @50 : rc/rc
    rc = rootlet(length=0.06, radius=0.003, hairs=2)
  num ROOT_DEPTH @60 : dc/dc
    dc = 0.25
  num ROOT_ALLOC @70 : ac/ac
    ac = 0.2
  num ROOT_GRAV @85 : gc/gc
    gc = 0.05
`;


// A melon: runners that crawl over the ground, with lobed leaves, tendrils, yellow flowers
// and ribbed melons resting on the soil. The runners are laid exactly flat with no pull
// upward, and meander only sideways (a yaw, not ~, which also pitches), so they stay down.
export const SWEETRIND = `plant "Sweetrind"
axiom A
root R

chromosome 1
  rule BLOOM @5 : Mf/Mf   # every fourth node flowers
    Mf = S when x % 4 == 1 and x < 12 -> F +(16 * sin(x * 0.9) + 20 * rand() - 10) [ ^(80) @flower ] [ -(55) ^(45) @leaf ] S(x + 1)
  rule APEX @20 : Ma/Ma   # four runners fan out from the crown, pressed flat
    Ma = A -> F(0.015) [ &(90) S(0) ] /(90) [ &(90) S(2) ] /(90) [ &(90) S(1) ] /(90) [ &(90) S(3) ]
  rule FRUITING @30 : Mm/Mm   # ...and the one after a flower sets a melon
    Mm = S when x % 4 == 2 and x < 12 -> F +(16 * sin(x * 0.9) + 20 * rand() - 10) [ -(80) ^(40) F(0.12) &(40) @fruit ] [ +(55) ^(45) @leaf ] S(x + 1)
  rule LATERAL @45 : Ms/Ms   # runner: alternate leaves, each with a tendril
    Ms = S when x < 12 -> F +(16 * sin(x * 0.9) + 20 * rand() - 10) [ +(55 - 110 * (x % 2)) ^(45) @leaf ] [ -(60 - 120 * (x % 2)) @leaflet ] S(x + 1)
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : am/am
    am = 40
  num PHYLLO @70 : gm/gm
    gm = 90
  num INTERNODE @85 : im/im
    im = 0.2

chromosome 2
  organ leaf @10 : Ml/Ml
    Ml = blade(lobed(n=5, depth=0.14), length=0.3, width=0.32, curl=-0.2, fold=0.1, wave=0.35, stalk=0.14,
               color=hsl($LEAF_HUE, 0.45, 0.36))
  organ leaflet @20 : Mt/Mt   # a tendril
    Mt = spike(length=0.12, radius=0.004, bend=3, color=hsl(0.22, 0.4, 0.45))
  organ flower @50 : Mw/Mw
    Mw = group(whorl(petal, n=$PETALS, tilt=65), bulb(length=0.02, radius=0.012, color=hsl(0.13, 0.8, 0.45)))
  num PIGMENT @55 : Pm/Pm
    Pm dom 2 = 0.9
  num PETAL_HUE @58 : ym/ym
    ym = 0.14
  organ petal @60 : Mp/Mp
    Mp = blade(sf(m=1, n1=0.7, n2=1, n3=1), length=0.05, width=0.04, curl=-0.1,
               color=hsl($PETAL_HUE, $PIGMENT, 0.6))
  num PETALS @65 : fm/fm
    fm = 5
  organ fruit @80 : Mr/Mr   # a ribbed, golden melon
    Mr = bulb(length=0.3, radius=0.13, point=0.7, ribs=10, ribdepth=0.05, color=hsl(0.12, 0.55, 0.55))

chromosome 3
  num TROPISM @10 : tm/tm   # no pull upward: the runners stay flat
    tm = 0
  num STEM_W @30 : swm/swm
    swm = 0.014
  num RESERVE @20 : rm/rm
    rm = 5
  num ALLOC @40 : alm/alm
    alm = 0.75
  num SHADE_TOL @50 : stm/stm
    stm = 0.1
  num APICAL @70 : apm/apm
    apm = 0.7
  num BLOOM_AGE @60 : em/em
    em = 4
  num TAPER @80 : km/km
    km = 0.9
  num LEAF_HUE @90 : hm/hm
    hm = 0.29

chromosome 4   # temperature tolerance: hot summers
  num T_OPT @10 : cm/cm
    cm = 27
  num T_WIDTH @30 : nm/nm
    nm = 10
  num T_LETHAL_LO @55 : lm/lm
    lm = 2
  num T_LETHAL_HI @80 : sm/sm
    sm = 44

chromosome 5   # roots: a taproot with wide laterals
  rule ROOT_APEX @10 : Rm/Rm
    Rm = R when depth < $ROOT_DEPTH -> F(0.08) [ &(70) Q ] /(120) [ &(70) Q ] /(120) R
  rule ROOT_LATERAL @30 : Lm/Lm
    Lm = Q when x < 4 -> F(0.08) ~(12) [ &(40) @rootlet ] Q(x + 1)
  organ rootlet @50 : rm/rm
    rm = rootlet(length=0.06, radius=0.003, hairs=2)
  num ROOT_DEPTH @60 : dm/dm
    dm = 0.6
  num ROOT_ALLOC @70 : am/am
    am = 0.25
  num ROOT_GRAV @85 : gm/gm
    gm = 0.3
`;

// A cardoon: silver lobed leaves and a spiny thistle head with a purple tuft.
export const CARDO = `plant "Cardo"
axiom A
root R

chromosome 1
  rule BLOOM @5 : Cd/Cd
    Cd dom 2 = A when step >= $BLOOM_AGE -> F(0.3) @head(4)   # the head faces straight up
  rule APEX @20 : Sa/Sa
    Sa = A -> F ~(4) [ &(58) @leaf(mix(1.8, 0.5, step / $BLOOM_AGE)) ] /($PHYLLO) A   # big leaves low, small ones up the stem
  rule LATERAL @45 : 0/0
  rule FRUITING @50 : 0/0
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : au/au
    au = 35
  num PHYLLO @70 : gu/gu
    gu = 137.5
  num INTERNODE @85 : iu/iu
    iu = 0.15

chromosome 2
  organ leaf @10 : Cl/Cl   # deeply lobed, wavy, silver-grey
    Cl = blade(lobed(n=11, depth=0.35), length=0.55, width=0.28, curl=-0.2, fold=0.25, wave=0.6,
               color=hsl(0.38, 0.15, 0.55), edge=hsl(0.38, 0.1, 0.75))
  organ leaflet @20 : pu/pu
    pu = blade(ellipse(), length=0.1, width=0.05, color=hsl($LEAF_HUE, 0.5, 0.33))
  organ bract @40 : Cb/Cb   # a small flat scale with a pale rim
    Cb = blade(ellipse(), length=0.024, width=0.015, curl=0.04, color=hsl(0.3, 0.3, 0.32), edge=hsl(0.2, 0.25, 0.62))
  organ scales @42 : Cs/Cs   # scales lying flat on a ball of radius 0.032, in spirals (rings looked like a pineapple)
    Cs = group(spiral(offset(tilt(bract, deg=-78), y=0.031), n=46, height=0, tilt=155, shrink=1),
               spiral(offset(tilt(bract, deg=-80), y=0.032), n=38, height=0, tilt=84, shrink=1))
  organ floret @45 : Cf/Cf   # a thin strand curving up and in (a negative bend), so the brush is a dome
    Cf = spike(length=0.09, radius=0.005, bend=-0.22, color=hsl($PETAL_HUE, $PIGMENT, 0.74))
  organ sweep @46 : Cw/Cw   # a long side strand that sweeps up to almost the height of the middle
    Cw = spike(length=0.13, radius=0.005, bend=-0.75, color=hsl($PETAL_HUE, $PIGMENT, 0.74))
  organ brush @47 : Cr/Cr   # the soft lavender brush, a round dome
    Cr = group(spiral(floret, n=64, height=0.012, tilt=92, shrink=0.996),   # spirals, not whorls: one even tuft, no rings
               spiral(sweep, n=80, height=0.01, tilt=98, shrink=1),   # full sides, curving up
               spiral(sweep, n=60, height=0.01, tilt=84, shrink=1),
               spiral(floret, n=44, height=0.012, tilt=52, shrink=1),
               spiral(floret, n=26, height=0.01, tilt=22, shrink=1))   # enough in the middle, or the top looks sunken
  organ head @50 : Ch/Ch   # a scaly ball with a purple brush on top
    Ch = offset(group(offset(bulb(length=0.064, radius=0.03, color=hsl(0.25, 0.3, 0.3)), y=-0.032),
                      scales, offset(brush, y=0.02)), y=0.032)
  num PIGMENT @55 : Pu/Pu
    Pu dom 2 = 0.5
  num PETAL_HUE @58 : yu/yu
    yu = 0.87   # mauve
  organ petal @60 : Ra/Ra
    Ra = blade(sf(m=1, n1=0.6, n2=0.9, n3=0.9), length=0.24, width=0.07, curl=-0.12,
               color=hsl($PETAL_HUE, $PIGMENT, 0.55))
  num PETALS @65 : fu/fu
    fu = 21
  organ fruit @80 : 0/0

chromosome 3
  num TROPISM @10 : tu/tu
    tu = 0.25
  num STEM_W @30 : swu/swu
    swu = 0.018
  num RESERVE @20 : ru/ru
    ru = 4
  num ALLOC @40 : alu/alu
    alu = 0.75
  num SHADE_TOL @50 : stu/stu
    stu = 0.1
  num APICAL @70 : apu/apu
    apu = 1
  num BLOOM_AGE @60 : eu/eu
    eu = 7
  num TAPER @80 : ku/ku
    ku = 0.6
  num LEAF_HUE @90 : hu/hu
    hu = 0.38
  num INK @95 : ik/ik   # a light, thin outline, so the brush looks calm...
    ik = 0.45
  num INK_TINT @97 : it/it   # ...in the plant's own dark colours, not black
    it = 1
  num YELLOW_WASH @98 : yw/yw   # keep the brush lavender in sunlight
    yw = 0
  num SOFT_SHADE @99 : ss/ss   # a mellow, pastel shadow
    ss = 0.5

chromosome 4   # temperature tolerance: a summer annual
  num T_OPT @10 : cu/cu
    cu = 24
  num T_WIDTH @30 : nu/nu
    nu = 10
  num T_LETHAL_LO @55 : lu/lu
    lu = 1
  num T_LETHAL_HI @80 : su/su
    su = 40

chromosome 5   # roots: a taproot with short laterals
  rule ROOT_APEX @10 : Ru/Ru
    Ru = R when depth < $ROOT_DEPTH -> F(0.09) [ &(60) Q ] /(137.5) R
  rule ROOT_LATERAL @30 : Lu/Lu
    Lu = Q when x < 3 -> F(0.06) [ &(40) @rootlet ] Q(x + 1)
  organ rootlet @50 : ru/ru
    ru = rootlet(length=0.06, radius=0.003, hairs=2)
  num ROOT_DEPTH @60 : du/du
    du = 0.7
  num ROOT_ALLOC @70 : au/au
    au = 0.25
  num ROOT_GRAV @85 : gu/gu
    gu = 0.4
`;

export const STARTERS = [FERNWORT, OAKHART, SUNRAY, VINEWOOD, CANEBRAKE, PILLARSPINE, SWEETRIND, CARDO];
