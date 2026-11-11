# PODL — Plant & Organ Description Language

PODL describes a plant as a **diploid genome**. Each gene (locus) carries two alleles, and each allele is a small program. Dominance decides which programs are expressed. The expressed programs then drive an L-system that grows a shoot and a root system, and a shape grammar that builds the organs placed on them.

Reference implementation: `src/podl/` (`genome.ts` parses and expresses, `expr.ts` handles expressions, `develop.ts` grows the plant, `organs.ts` builds organ shapes).

```
plant "Fernwort"
axiom A
root R

chromosome 1
  rule APEX @20 : Fe/Fe
    Fe = A -> F ~(6) [ &(50) @leaf ] /($PHYLLO) A
  num ANGLE @60 : a/a
    a = 40

chromosome 2
  organ leaf @10 : C/s
    C dom 2 = chain(leaflet, n=7, spacing=0.11, angle=70, shrink=0.88, tip=1)
    s = scale(leaflet, s=2.6)
```

---

## 1. Lexical structure

- The source is read **line by line**.
- `#` starts a comment that runs to the end of the line. It is stripped everywhere, including inside the plant name.
- Leading and trailing whitespace is ignored, so indentation is only for readability. Blank lines are ignored.
- An allele definition may continue onto later lines **only while its parentheses are unbalanced**. The continuation lines are joined with single spaces.
- Every error is reported as `Line N: message`.

## 2. Genome file

A genome is a sequence of the following statements, in any order:

| Statement | Form | Meaning |
|---|---|---|
| Name | `plant "NAME"` | Display name. Default `Unnamed`. |
| Shoot axiom | `axiom SUCCESSOR` | Starting module string of the shoot. Default `A`. |
| Root axiom | `root SUCCESSOR` | Starting module string of the root system. If it is omitted, the plant grows no roots. |
| Chromosome | `chromosome ID` | Sets the chromosome for the genes that follow. `ID` is any token without spaces. Default `1`. |
| Gene header | `KIND NAME @POS : A1/A2` | Declares a locus. See §3. |
| Allele | `ID [dom N] = SOURCE` | Defines an allele of the most recent gene. See §3.2. |

Any other line is an error.

## 3. Genes

### 3.1 Gene header

```
KIND NAME @POS : GENOTYPE_1 / GENOTYPE_2
```

- `KIND` is `num`, `rule` or `organ`.
- `NAME` must be unique in the genome.
  - `num` and `rule` genes: UPPERCASE (`[A-Z_][A-Z0-9_]*`).
  - `organ` genes: lowercase (`[a-z_][a-z0-9_]*`).
- `POS` is a non-negative number giving the locus position on its chromosome. Loci are sorted by chromosome (numeric-aware) and then by position. That order matters for rules (§6.3) and for crossing, where homologous loci pair up by name.
- `GENOTYPE_1/GENOTYPE_2` are the ids of the two alleles this individual carries. The id `none` or `0` means a non-functional (null) allele that does not need a definition. Any other id must be defined under the gene.

### 3.2 Allele definition

```
ID [dom N] = SOURCE
```

- `ID` is any token without whitespace or `=`. Ids are local to their gene.
- `dom N` is an integer dominance. Default `1`. A null allele has dominance `0`.
- `SOURCE` is the program. Its grammar depends on the gene kind:

| Kind | Source | Meaning |
|---|---|---|
| `num` | expression (§4) | A number. Other programs read it as `$NAME`. |
| `rule` | rule (§5) | A production that rewrites one module. |
| `organ` | organ expression (§7) | A shape. Successors place it with `@name`. |

`SOURCE` may also be the literal `none`, which makes a non-functional allele (for example `m dom 1 = none`).

Allele sources are validated when they are parsed, so a syntax error is reported on the allele's line.

### 3.3 Expression (genotype → phenotype)

Each locus resolves to one of five modes. "Same allele" means the two **sources** are identical. Ids are not compared.

| Mode | Condition | Expressed |
|---|---|---|
| `homo` | Both alleles are the same and functional. | That allele. |
| `off` | Both are null, or the dominant one is null. | Nothing. The gene is absent. |
| `dominant` | The dominances differ. | The allele with the higher `dom`. |
| `dosage` | Equal dominance, and one allele is null. | The functional allele. A `num` gene is **halved**. |
| `co` | Equal dominance, two different functional alleles. | Both (codominance). |

How codominance combines the two alleles:

- **num**: the two values are averaged.
- **organ**: the two shape specs are blended. Numbers at matching positions are averaged when both specs have the same structure. Where they differ, the first allele wins.
- **rule**: a mosaic. Each time a module tries this gene, one of the two rules is chosen at random.

## 4. Expressions

Expressions are shared by `num` genes, rule conditions, successor arguments and organ programs.

```
expr    := or
or      := and   ( ('or'  | '||') and )*
and     := cmp   ( ('and' | '&&') cmp )*
cmp     := add   ( ('<' | '<=' | '>' | '>=' | '==' | '!=') add )?    # non-associative
add     := mul   ( ('+' | '-') mul )*
mul     := unary ( ('*' | '/' | '%') unary )*
unary   := '-' unary | 'not' unary | primary
primary := NUMBER | '$' GENE | IDENT | IDENT '(' args? ')' | '(' expr ')'
args    := arg ( ',' arg )*
arg     := [IDENT '='] expr
```

- Numbers are written like `12`, `0.5`, `.5` or `1e-3`.
- **Truth values:** `0` is false and anything else is true. Comparisons return `1` or `0`. `and` and `or` short-circuit, and `or` returns its first truthy operand.
- **Division and modulo by zero** return `0`.
- **`$GENE`** reads the expressed value of a `num` gene (§4.1).
- A bare **`IDENT`** is a context variable (§6.2) or, inside an organ program, a reference to an organ gene (§7). An unknown name is an evaluation error.
- **Built-in functions:**
  - `min`, `max`, `abs`, `sin`, `cos`, `sqrt`, `pow`, `floor`, `exp` work as in JavaScript. Angles are in radians.
  - `clamp(x, lo, hi)` limits `x` to the range `lo`–`hi`.
  - `mix(a, b, t)` returns `a + (b − a)·t`.
  - `rand()` returns a uniform number in [0, 1) from the plant's seeded generator.

### 4.1 Reading genes

A `num` gene is evaluated lazily, the first time it is read, and the result is cached for the whole plant. This means a gene can depend on other genes (epistasis).

- An expressed `num` gene evaluates its program or programs (see §3.3).
- A gene that is absent or `off` reads its built-in default (table below), or `0` if it has none.
- A circular reference reads `0` at the point where the cycle closes.
- An evaluation error, or a result that is not finite, reads `0`.
- Context variables are **not** available in `num` genes.

The turtle reads these genes. Their defaults are:

| Gene | Default | Used for |
|---|---|---|
| `ANGLE` | 30 | Default angle for `+ - & ^`, in degrees. |
| `PHYLLO` | 137.5 | Default roll for `/ \`, in degrees. |
| `INTERNODE` | 0.5 | Default length of `F`. |
| `STEM_W` | 0.05 | Starting stem width. |
| `TROPISM` | 0.15 | How strongly the shoot bends toward the light. |
| `TAPER` | 0.7 | Width factor applied when a branch starts at `[`. |
| `ROOT_W` | 0.012 | Starting root width. |
| `ROOT_GRAV` | 0.25 | How strongly roots bend toward gravity. |
| `ROOT_DEPTH` | 0.5 | Conventional depth limit, read by the starters' root rules. |
| `INK` | 1 | Weight of the ink outline the viewer draws round the plant. 0 draws none; a lighter line is also thinner. |
| `INK_TINT` | 0 | Colour of that outline: 0 black ink, 1 a dark shade of the plant's own colour. |
| `SOFT_SHADE` | 0 | How gentle the viewer's shadow on the plant is: 0 the full cool shadow, toward 1 close to the sunlit colour. |
| `YELLOW_WASH` | 1 | The viewer's yellow (gamboge) tint: 1 on every colour, 0 only on greens and yellows, so purples stay purple. |

Every other name is free. Genomes may define genes for their own use (`BLOOM_AGE`, `PETALS`) or for a host simulation (`RESERVE`, `T_OPT`, …). The PODL package itself ignores those.

## 5. Rules and successors

```
rule      := PRED [ 'when' COND ] '->' SUCCESSOR
PRED      := one letter A–Z
COND      := expr
SUCCESSOR := symbol*
symbol    := ( MODULE | TURTLE | '@' ORGAN ) [ '(' expr ')' ] | '[' | ']'
MODULE    := A–Z
TURTLE    := + - & ^ / \ ! ~
ORGAN     := [a-z_][a-z0-9_]*
```

- Whitespace between symbols is optional.
- Brackets must balance.
- An empty successor (`A ->`) deletes the module.
- The axiom and the root axiom are successors too.

**Turtle symbols.** If an argument is omitted, the default in the table is used.

| Symbol | Argument (default) | Effect |
|---|---|---|
| `F` | length (`$INTERNODE`) | Draws an internode and moves forward. |
| `+` / `-` | degrees (`$ANGLE`) | Turns left / right (yaw about the up axis U). |
| `&` / `^` | degrees (`$ANGLE`) | Pitches down / up (about the left axis L). |
| `/` / `\` | degrees (`$PHYLLO`) | Rolls (about the heading axis H). |
| `!` | factor (0.8) | Multiplies the current width. |
| `~` | degrees (12) | Applies a random pitch or yaw of up to ± the argument. |
| `[` / `]` | — | Pushes / pops the turtle state. A new branch starts at width × `$TAPER`. |
| `@organ` | scale (1) | Places an organ. |

Other capital letters are **modules**. They draw nothing, but rules can rewrite them. A module's argument is stored as its value `x`. `F` is also a module, so a rule with predicate `F` can rewrite it.

## 6. Development

### 6.1 Derivation

The plant develops in discrete **steps** (12 by default). The shoot and the root system each hold a module string. They develop side by side, and both use the same set of rules.

In each step, every module is processed in parallel:

1. A capital-letter module that has a matching rule (§6.3) is replaced by that rule's successor.
2. Every other module stays in place and its `age` increases by 1.

New modules start at age 0. Symbol arguments are evaluated once, when the module is created, using the context of the module that was rewritten. This is why `Q(x + 1)` counts upward.

Derivation stops early, and the result is flagged as `truncated`, once the shoot and root strings together hold more than 9000 modules.

### 6.2 Context variables

These variables are available in rule conditions and successor arguments:

| Variable | Meaning |
|---|---|
| `age` | Steps since the module was created. |
| `order` | Branch order: how many brackets the module is nested in. |
| `step` | The current derivation step, counting from 0. |
| `x` | The module's own argument, or 0. |
| `depth` | How far the module sits below the ground, in metres (negative above ground). |

### 6.3 Rule selection

For each module, the expressed rules with a matching predicate are tried **in locus order**: chromosome first, then position. The first rule whose condition is true rewrites the module. If no rule matches, the module just ages.

- A condition that raises an error counts as false.
- An argument that raises an error evaluates to `0`.
- For a codominant rule gene, one of its two alleles is picked at random on each attempt (see §3.3). If the picked allele has a different predicate, the gene is skipped for that attempt.

### 6.4 Interpretation

After each step, and once more at the end, a turtle walks each string:

- The **shoot** starts at the origin heading up (+Y). Tropism bends it toward the vertical, or toward a `lean` direction supplied by the host.
- The **root** starts heading down. Gravitropism (`$ROOT_GRAV`) bends it toward −Y.
- An internode grows with its age. Its length is multiplied by `min(1, 0.45 + 0.3·age)`. Its base thickens by up to 2.5× as it ages.
- Width shrinks slightly along each internode.
- An organ grows to full size over its first three steps (`(age+1)/3`).

The output is a list of stem segments and organ placements. Each organ placement carries the turtle frame (H, L, U).

## 7. Organ programs

An `organ` allele is an expression whose function calls build a **shape spec**. Inside it:

- A bare lowercase name refers to another organ gene. References may nest up to 5 levels deep. Beyond that, or if the referenced gene is absent, the reference yields nothing.
- `$GENE`, arithmetic and the math functions work as usual.

Arguments can be given by position (in the order shown below) or by name. Named arguments the primitive doesn't recognise are ignored. Calling an unknown function makes the whole organ yield nothing.

**Organ space:**

- The origin is the attachment point.
- +Y runs along the turtle's heading.
- +Z is the parent's up vector.
- Lengths are in metres. Angles are in degrees.

### 7.1 Profiles (closed outlines for `blade`)

| Function | Parameters (defaults) | Shape |
|---|---|---|
| `sf` | `m=2 n1=1 n2=1 n3=1 a=1 b=1` | Gielis superformula. |
| `ellipse` | — | Ellipse. |
| `lobed` | `n=5 depth=0.3` | `n` rounded lobes. |
| `rose` | `k=3` | Rose curve. |
| `heart` | — | Cordate (heart-shaped) outline. |

The outline is stretched to fit the blade's length and width, with its first lobe pointing along +Y.

### 7.2 Colour

`hsl(h=0.3, s=0.5, l=0.4)`. All three components run from 0 to 1. `h` wraps around. `s` and `l` are clamped.

Colour also has a physiological meaning. Tissue whose hue is near green counts as photosynthetic, and darker tissue absorbs more heat.

### 7.3 Primitives

| Function | Parameters (defaults) |
|---|---|
| `blade` | `profile=ellipse length=1 width=0.5 curl=0 fold=0 wave=0 stalk=0 color edge thick=0.0003` |
| `bulb` | `length=0.4 radius=0.15 point=1 ribs=0 ribdepth=0.1 color` |
| `spike` | `length=0.3 radius=0.03 bend=0 color` |
| `rootlet` | `length=0.06 radius=0.003 hairs=1 color` |

- **`blade`** is a leaf-like sheet.
  - `curl` bends it along its length. `fold` creases it along the midrib. `wave` ripples the margin.
  - `stalk` adds a petiole of that length.
  - `edge` tints a thin rim in a second colour.
  - `thick` is the sheet's thickness. Values range from thin leaves to fleshy, succulent ones.
- **`bulb`** is a solid of revolution.
  - `point` sharpens its ends.
  - `ribs` and `ribdepth` add longitudinal ribs.
- **`spike`** is a cone. `bend` curves it toward +Z.
- **`rootlet`** is a fine root. `hairs` multiplies its water-absorbing surface without adding drawn geometry.

A `color` that is not given falls back to a default for each primitive: green for a blade, red for a bulb, pale for a spike, buff for a rootlet.

### 7.4 Composition

| Function | Parameters (defaults) | Effect |
|---|---|---|
| `whorl` | `organ n=5 tilt=45 twist=0` | `n` copies evenly spaced around +Y, each tilted out by `tilt`. |
| `spiral` | `organ n=12 height=0.5 tilt=60 shrink=0.97` | `n` copies rising along +Y at the golden angle, each scaled by `shrink`ⁱ. |
| `chain` | `organ n=4 spacing=0.2 angle=50 shrink=0.9 tip=1` | A rachis carrying `n` opposite pairs, plus a terminal copy if `tip > 0.5`. |
| `group` | `organ, organ, …` | All arguments together. Arguments that yield nothing are dropped. |
| `scale` | `organ s=1` | Uniform scale. |
| `tilt` | `organ deg=30` | Rotation about X. |
| `offset` | `organ y=0.1` | Translation along +Y. |

### 7.5 Limits

Parameters are clamped to keep shapes buildable:

- `whorl.n` is clamped to 1–40, `spiral.n` to 1–80, `chain.n` to 1–30.
- `scale.s` is clamped to 0.05–5.
- Blade `length` is clamped to 0.02–6 and `width` to 0.01–6.

Building stops descending past 8 levels of nesting, 80 000 vertices or 20 000 visited nodes.

If an organ yields no geometry, its placements are skipped.

## 8. Determinism

All randomness comes from a single seeded generator (`develop(genome, { seed })`). This covers `rand()`, `~` jitter and mosaic rule choices. The same genome, seed and options always produce the same plant.

## 9. Canonical form

`printGenome` writes a genome back out in canonical form:

- The `plant`, `axiom` and `root` statements come first.
- Chromosomes follow in sorted order. Each gene line is indented by two spaces, and each allele line by four.
- Each distinct allele appears once. `dom` is omitted when it is 1, and null `0` alleles are not printed.
- Multi-line allele sources are joined onto one line.

Parsing the canonical form reproduces the same genome.
