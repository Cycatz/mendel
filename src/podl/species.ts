// Starter genomes. They share one gene set (one "genus"), so crosses pair up homologous loci,
// but their alleles differ enough to give three very different body plans.
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

export const SPIREBUSH = `plant "Spirebush"
axiom A
root R

chromosome 1
  rule BLOOM @5 : n/n
    n = A when step >= $BLOOM_AGE -> @flower
  rule APEX @20 : Sp/Sp
    Sp = A -> F F [ &($ANGLE) B(0) ] /($PHYLLO) [ &($ANGLE) B(1) ] /($PHYLLO) A
  rule LATERAL @45 : Bt/Bt
    Bt dom 2 = B when x < 4 -> F(0.32) [ +(55) @leaf ] [ -(55) @leaf ] [ &(35) B(x + 2) ] ~(10) B(x + 1)
  rule FRUITING @50 : Fr/0
    Fr dom 2 = B when x >= 4 -> F(0.15) @fruit
  rule SEEDHEAD @55 : 0/0
  num ANGLE @60 : as/as
    as = 38
  num PHYLLO @70 : gs/gs
    gs = 140
  num INTERNODE @85 : is/is
    is = 0.28

chromosome 2
  organ leaf @10 : Ov/Ov
    Ov = blade(sf(m=2, n1=0.6, n2=1, n3=1), length=0.34, width=0.14, curl=-0.1, fold=0.2, stalk=0.05,
               color=hsl($LEAF_HUE, 0.5, 0.3))
  organ leaflet @20 : ps/ps
    ps = blade(ellipse(), length=0.12, width=0.06, color=hsl($LEAF_HUE, 0.5, 0.3))
  organ flower @50 : Wh/Wh
    Wh = whorl(petal, n=$PETALS, tilt=70)
  num PIGMENT @55 : Ps/Ps
    Ps dom 2 = 0.8
  num PETAL_HUE @58 : y/y
    y = 0.13
  organ petal @60 : rd/rd
    rd = blade(ellipse(), length=0.16, width=0.12, curl=-0.1, color=hsl($PETAL_HUE, $PIGMENT, 0.6))
  num PETALS @65 : fs/fs
    fs = 6
  organ fruit @80 : Be/Be
    Be = whorl(bulb(length=0.12, radius=0.07, point=0.8, color=hsl(0.97, 0.75, 0.42)), n=3, tilt=35)

chromosome 3
  num TROPISM @10 : ts/ts
    ts = 0.06
  num STEM_W @30 : sws/sws
    sws = 0.05
  num RESERVE @20 : rs/rs
    rs = 6
  num ALLOC @40 : als/als
    als = 0.6
  num SHADE_TOL @50 : sts/sts
    sts = 0.15
  num APICAL @70 : aps/aps
    aps = 0.9
  num BLOOM_AGE @60 : es/es
    es = 10
  num TAPER @80 : ks/ks
    ks = 0.65
  num LEAF_HUE @90 : hs/hs
    hs = 0.27

chromosome 4   # temperature tolerance: heat-hardy warm specialist
  num T_OPT @10 : cs/cs
    cs = 23
  num T_WIDTH @30 : ns/ns
    ns = 11
  num T_LETHAL_LO @55 : hs/hs
    hs = 2
  num T_LETHAL_HI @80 : ss/ss
    ss = 42

chromosome 5   # roots: a deep taproot
  rule ROOT_APEX @10 : Rs/Rs
    Rs = R when depth < $ROOT_DEPTH -> F(0.1) [ &(55) Q ] /(137.5) R
  rule ROOT_LATERAL @30 : Ls/Ls
    Ls = Q when x < 2 -> F(0.07) [ &(35) @rootlet ] Q(x + 1)
  organ rootlet @50 : hs/hs
    hs = rootlet(length=0.08, radius=0.004, hairs=1.5)
  num ROOT_DEPTH @60 : ds/ds
    ds = 0.85
  num ROOT_ALLOC @70 : as/as
    as = 0.3
  num ROOT_GRAV @85 : gs/gs
    gs = 0.45
`;

export const STARCUP = `plant "Starcup"
axiom A
root R

chromosome 1
  rule BLOOM @5 : Sc/Sc
    Sc dom 2 = A when step >= $BLOOM_AGE -> !(0.6) F(0.45) S(1)
  rule APEX @20 : Ro/Ro
    Ro dom 2 = A when step < 6 -> F(0.03) /($PHYLLO) [ &(78) @leaf ] /($PHYLLO) [ &(66) @leaf ] A
  rule LATERAL @45 : Sb/Sb   # the flowering stalk rises a segment a day...
    Sb = S when x < 3 -> F(0.45) S(x + 1)
  rule FRUITING @50 : Sf/Sf  # ...and is crowned with the flower
    Sf = S when x >= 3 -> F(0.3) @flower U
  rule SEEDHEAD @55 : Sh/Sh  # the fruit sets a day later
    Sh = U -> [ &(40) @fruit ]
  num ANGLE @60 : ac/ac
    ac = 30
  num PHYLLO @70 : g/g
    g = 137.5
  num INTERNODE @85 : ic/ic
    ic = 0.2

chromosome 2
  organ leaf @10 : Al/Al
    Al = blade(sf(m=2, n1=0.4, n2=0.6, n3=0.6), length=0.9, width=0.26, curl=0.35, fold=0.8,
               color=hsl($LEAF_HUE, 0.35, 0.45), edge=hsl(0.98, 0.5, 0.45))
  organ leaflet @20 : pc/pc
    pc = spike(length=0.1, radius=0.01)
  organ flower @50 : Sg/Sg
    Sg = spiral(petal, n=18, height=0.3, tilt=72, shrink=0.96)
  num PIGMENT @55 : Pc/Pc
    Pc dom 2 = 0.9
  num PETAL_HUE @58 : o/o
    o = 0.05
  organ petal @60 : st/st
    st = blade(sf(m=1, n1=0.3, n2=0.3, n3=0.3), length=0.35, width=0.12, curl=-0.4,
               color=hsl($PETAL_HUE, $PIGMENT, 0.55))
  num PETALS @65 : fc/fc
    fc = 8
  organ fruit @80 : Pd/Pd
    Pd = bulb(length=0.3, radius=0.07, point=0.7, ribs=6, ribdepth=0.2, color=hsl(0.2, 0.5, 0.4))

chromosome 3
  num TROPISM @10 : tc/tc
    tc = 0.3
  num STEM_W @30 : swc/swc
    swc = 0.06
  num RESERVE @20 : rc/rc
    rc = 4.5
  num ALLOC @40 : alc/alc
    alc = 0.8
  num SHADE_TOL @50 : stc/stc
    stc = 0.3
  num APICAL @70 : apc/apc
    apc = 0.7
  num BLOOM_AGE @60 : ec/ec
    ec = 7
  num TAPER @80 : kc/kc
    kc = 0.6
  num LEAF_HUE @90 : hc/hc
    hc = 0.4

chromosome 4   # temperature tolerance: generalist
  num T_OPT @10 : cc/cc
    cc = 19
  num T_WIDTH @30 : nc/nc
    nc = 14
  num T_LETHAL_LO @55 : hc/hc
    hc = 0
  num T_LETHAL_HI @80 : sc/sc
    sc = 38

chromosome 5   # roots: medium depth, many laterals
  rule ROOT_APEX @10 : Rc/Rc
    Rc = R when depth < $ROOT_DEPTH -> F(0.08) [ &(65) Q ] /(90) [ &(65) Q ] /(90) R
  rule ROOT_LATERAL @30 : Lc/Lc
    Lc = Q when x < 3 -> F(0.06) [ &(45) @rootlet ] Q(x + 1)
  organ rootlet @50 : hc/hc
    hc = rootlet(length=0.06, radius=0.003, hairs=2.5)
  num ROOT_DEPTH @60 : dc/dc
    dc = 0.5
  num ROOT_ALLOC @70 : ac/ac
    ac = 0.18
  num ROOT_GRAV @85 : gc/gc
    gc = 0.25
`;

export const STARTERS = [FERNWORT, SPIREBUSH, STARCUP];
