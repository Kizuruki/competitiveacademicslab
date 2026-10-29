# Source of content/fantasy-world.json. Edit here, then run: python3 scripts/build_world.py content/fantasy-world.json
"""Source for content/fantasy-world.json. Every civilization fills the same 15 slots with the same
kinds of facts, so no civilization is easier than another."""
import json, sys

SLOTS = [  # slot id, kind (shown to players), chapter of the story it belongs to
    ('ruler', 'person', 1), ('general', 'person', 2), ('scholar', 'person', 3), ('poet', 'person', 5),
    ('city', 'place', 1), ('river', 'place', 4), ('mountain', 'place', 4), ('island', 'place', 5),
    ('battle', 'event', 2), ('treaty', 'event', 2), ('disaster', 'event', 3),
    ('poem', 'work', 5), ('monument', 'work', 1), ('deity', 'belief', 4), ('code', 'law', 3),
]
CHAPTER_TITLES = {1: 'The Founding', 2: 'The War', 3: 'The Warning', 4: 'The Land', 5: 'The Song'}

# Each answer: slot -> (name, type word used in "This ___ …", accepted answers)
# Each clue: (slot, study wording, test wording, key phrase that must appear in its story chapter)
CIVS = []

CIVS.append(dict(
    id='ostrevan', name='The Ostrevan Isles', blurb='Seven islands of glassmakers and sailors, ruled from the harbor city of Veshka.',
    answers={
        'ruler': ('Ysolde Marrow', 'queen', ['Ysolde Marrow', 'Ysolde', 'Marrow', 'Queen Ysolde']),
        'general': ('Corvin Ashlay', 'general', ['Corvin Ashlay', 'Corvin', 'Ashlay']),
        'scholar': ('Ilvane Docht', 'scholar', ['Ilvane Docht', 'Ilvane', 'Docht']),
        'poet': ('Tamsin Rook', 'poet', ['Tamsin Rook', 'Tamsin', 'Rook']),
        'city': ('Veshka', 'city', ['Veshka']),
        'river': ('Ommet', 'river', ['Ommet', 'Ommet River']),
        'mountain': ('Mount Haverl', 'mountain', ['Mount Haverl', 'Haverl']),
        'island': ('Lisk', 'island', ['Lisk']),
        'battle': ('Battle of Brannoch Sound', 'battle', ['Battle of Brannoch Sound', 'Brannoch Sound', 'Brannoch']),
        'treaty': ('Treaty of Quell', 'treaty', ['Treaty of Quell', 'Quell']),
        'disaster': ('Saltgrave Flood', 'disaster', ['Saltgrave Flood', 'Saltgrave']),
        'poem': ('The Lay of Nine Lanterns', 'poem', ['The Lay of Nine Lanterns', 'Lay of Nine Lanterns', 'Nine Lanterns']),
        'monument': ('Glass Stair', 'monument', ['Glass Stair', 'the Glass Stair']),
        'deity': ('Oruna', 'deity', ['Oruna']),
        'code': ('Brine Code', 'law code', ['Brine Code', 'the Brine Code']),
    },
    clues=[
        ('ruler', 'This queen united the seven Ostrevan islands by winning a rowing race against their harbor-lords.',
         'Which queen gained rule over all seven Ostrevan islands after defeating the harbor-lords in a rowing contest?', 'rowing race'),
        ('ruler', 'This queen moved the royal court to Veshka.', 'Which queen made Veshka the seat of her court?', 'moved her court to Veshka'),
        ('ruler', 'This queen ordered the building of the Glass Stair.', 'Which queen commissioned the Glass Stair?', 'ordered the Glass Stair'),
        ('ruler', 'This queen wore a crown made of green sea-glass instead of gold.', 'Which queen refused a gold crown and wore one of green sea-glass?', 'green sea-glass'),
        ('general', 'This general won the Battle of Brannoch Sound.', 'Which general was victorious at Brannoch Sound?', 'won the day'),
        ('general', 'This general set burning rafts loose on the tide to scatter an enemy fleet.', 'Which general drove off an enemy fleet by sending blazing rafts out with the tide?', 'burning rafts'),
        ('general', 'This general was the younger brother of Queen Ysolde Marrow.', "Which general was Ysolde Marrow's younger brother?", 'younger brother'),
        ('general', 'This general spent his last years in exile on the island of Lisk.', 'Which general was banished to Lisk at the end of his life?', 'exile on Lisk'),
        ('scholar', 'This scholar invented a glass tide-clock that measured time with dripping seawater.', 'Which scholar built a clock of glass that kept time with drops of seawater?', 'tide-clock'),
        ('scholar', 'This scholar predicted the Saltgrave Flood two years before it happened.', 'Which scholar foretold the Saltgrave Flood two years in advance?', 'predicted the Saltgrave Flood'),
        ('scholar', 'This scholar founded the Lantern School in Veshka.', "Which scholar established Veshka's Lantern School?", 'Lantern School'),
        ('scholar', 'This scholar was said to have never once set foot on a ship.', 'Which scholar supposedly never boarded a ship in her entire life?', 'set foot on a ship'),
        ('poet', 'This poet wrote The Lay of Nine Lanterns.', 'Which poet was the author of The Lay of Nine Lanterns?', 'wrote The Lay of Nine Lanterns'),
        ('poet', 'This poet was paid in pearls by Queen Ysolde Marrow for every verse.', 'Which poet received a pearl from Ysolde Marrow for each verse?', 'paid her in pearls'),
        ('poet', 'This poet wrote every line to match the rhythm of oar strokes.', 'Which poet composed lines timed to the beat of rowing oars?', 'oar strokes'),
        ('poet', 'This poet vanished at sea while sailing to Lisk.', 'Which poet disappeared during a voyage to Lisk?', 'vanished at sea'),
        ('city', 'This city stands at the mouth of the Ommet River.', 'Which city lies where the Ommet River reaches the sea?', 'mouth of the Ommet'),
        ('city', "This city is famous for its glassblowers' furnaces.", 'Which city is known above all for its glass furnaces?', 'glassblowers'),
        ('city', "This city's harbor is closed each night by a chain stretched between two towers.", 'Which city shuts its harbor at night with a chain hung between twin towers?', 'chain stretched between two towers'),
        ('city', 'This city lost its lower quarter in the Saltgrave Flood.', "Which city's low district was destroyed by the Saltgrave Flood?", 'lower quarter'),
        ('river', 'This river rises on the slopes of Mount Haverl.', 'Which river has its source on Mount Haverl?', 'rises on the slopes of Mount Haverl'),
        ('river', 'This river empties into the Pale Sea.', 'Which river flows out into the Pale Sea?', 'emptying into the Pale Sea'),
        ('river', 'This river glows faintly blue each spring from tiny shining creatures.', 'Which river turns a faint glowing blue every spring because of small luminous creatures?', 'glows faintly blue'),
        ('river', "This river's name means 'the silver thread' in Old Ostrevan.", "Which river's name translates as 'silver thread' in the old Ostrevan tongue?", 'silver thread'),
        ('mountain', 'This mountain holds the main shrine of the goddess Oruna.', "On which mountain is Oruna's chief shrine?", 'main shrine of Oruna'),
        ('mountain', 'This mountain is mined for the white sand used in Ostrevan glass.', 'Which mountain supplies the white sand for Ostrevan glassmaking?', 'white sand'),
        ('mountain', 'This mountain has a crater lake at its summit.', 'Which mountain has a lake inside the crater at its top?', 'crater lake'),
        ('mountain', 'Pilgrims climb this mountain barefoot on the longest day of the year.', "Which mountain do pilgrims ascend without shoes on midsummer's day?", 'barefoot'),
        ('island', 'This island was where Corvin Ashlay lived out his exile.', 'To which island was Corvin Ashlay exiled?', 'lived out his exile'),
        ('island', 'This island has a lighthouse that burns whale oil.', "Which island's lighthouse is fueled with whale oil?", 'whale oil'),
        ('island', 'This island is the only source of purple dye in the Ostrevan Isles.', 'Which island alone produces purple dye in the Ostrevan Isles?', 'purple dye'),
        ('island', "This island's name means 'the last stone.'", "Which island has a name meaning 'the final stone'?", 'the last stone'),
        ('battle', 'This battle was fought in the strait where the Ommet River meets the Pale Sea.', 'Which battle took place in the channel where the Ommet River enters the Pale Sea?', 'the strait where the Ommet River pours into the Pale Sea'),
        ('battle', 'In this battle the Ostrevans defeated the raiders of Skarth.', 'Which battle ended in an Ostrevan victory over the Skarth raiders?', 'raiders of Skarth'),
        ('battle', 'This battle was fought during a total eclipse of the sun.', 'Which battle happened while the sun was fully eclipsed?', 'total eclipse'),
        ('battle', 'This battle led directly to the Treaty of Quell.', "Which battle's outcome brought about the Treaty of Quell?", 'led directly to the Treaty of Quell'),
        ('treaty', 'This treaty was signed aboard a ship anchored off Lisk.', 'Which treaty was agreed on a ship moored near Lisk?', 'aboard a ship anchored off the island of Lisk'),
        ('treaty', 'This treaty was sealed by Queen Ysolde Marrow and the chief of Skarth.', 'Which treaty did Ysolde Marrow conclude with the Skarth chieftain?', 'chief of Skarth sealed it'),
        ('treaty', 'Under this treaty, Skarth paid a yearly tribute of one hundred barrels of salt fish.', 'By which treaty did Skarth owe a hundred barrels of salted fish every year?', 'one hundred barrels of salt fish'),
        ('treaty', 'This treaty was engraved on a sheet of glass.', "Which treaty's text was cut into a pane of glass?", 'engraved on a sheet of glass'),
        ('disaster', 'This disaster was a storm flood in the year 214 of the Tide Reckoning.', 'Which disaster struck as a storm surge in year 214 of the Tide Reckoning?', 'year 214'),
        ('disaster', 'This disaster was predicted by the scholar Ilvane Docht.', 'Which disaster had Ilvane Docht forecast?', 'Ilvane predicted the Saltgrave Flood'),
        ('disaster', 'This disaster destroyed the lower quarter of Veshka.', "Which disaster wiped out Veshka's low district?", 'destroyed the lower quarter of Veshka'),
        ('disaster', 'This disaster is remembered each year by floating candles in glass bowls.', 'Which disaster is commemorated every year with candles set afloat in glass bowls?', 'floating candles in glass bowls'),
        ('poem', 'This poem was written by Tamsin Rook.', "Which poem is Tamsin Rook's work?", 'Tamsin Rook wrote'),
        ('poem', "This poem tells of Corvin Ashlay's night voyage to burn the enemy fleet.", 'Which poem recounts Corvin Ashlay sailing by night to set the enemy fleet ablaze?', 'night voyage'),
        ('poem', 'This poem has twelve cantos, each beginning at a different lighthouse.', "Which poem's twelve cantos each open at a different lighthouse?", 'twelve cantos'),
        ('poem', "This poem begins with the line 'The tide remembers every oar.'", "Which poem opens with 'The tide remembers every oar'?", 'The tide remembers every oar'),
        ('monument', 'This monument was commissioned by Queen Ysolde Marrow.', 'Which monument did Ysolde Marrow order built?', 'ordered the Glass Stair'),
        ('monument', 'This monument is made from more than ten thousand green glass blocks.', 'Which monument is built from over ten thousand blocks of green glass?', 'ten thousand blocks of green glass'),
        ('monument', "This monument climbs the cliff from Veshka's harbor to the palace.", 'Which monument rises up the cliff between the harbor of Veshka and the palace?', 'climbing from the harbor to the palace'),
        ('monument', 'This monument also works as a sundial, its shadow marking the hours on the harbor.', 'Which monument doubles as a sundial whose shadow tells the time across the harbor?', 'sundial'),
        ('deity', 'This deity is the goddess of tides.', 'Which deity rules over the tides?', 'goddess of tides'),
        ('deity', "This deity's sacred animal is the white seal.", 'Which deity is symbolized by a white seal?', 'white seal'),
        ('deity', "This deity's chief shrine is on Mount Haverl.", 'Which deity has her main shrine on Mount Haverl?', 'main shrine of Oruna'),
        ('deity', 'This deity is honored by throwing a glass bead into the sea at every new moon.', 'Which deity receives a glass bead cast into the sea each new moon?', 'glass bead'),
        ('code', 'This law code has thirty-three articles.', 'Which law code contains thirty-three articles?', 'thirty-three articles'),
        ('code', 'This law code says that anyone who rescues a sailor may claim a share of the ship\'s cargo.', "Which law code grants a person who rescues a sailor part of the ship's cargo?", 'rescues a sailor'),
        ('code', 'This law code is painted on the walls of the harbor towers in Veshka.', "Which law code is displayed on Veshka's harbor towers?", 'painted on the walls of the harbor towers'),
        ('code', "Under this law code, thieves were punished by being made to row the queen's barge.", 'Which law code sentenced thieves to row the royal barge?', "row the queen's barge"),
    ],
    story={
        1: """Long ago, the seven Ostrevan islands answered to seven quarrelling harbor-lords. Ysolde Marrow, a net-mender's daughter, challenged them all to a rowing race around the outer reefs and won it by half a length, and so the seven islands were united under one queen. When the goldsmiths offered her a crown, she sent it back and wore a circlet of green sea-glass instead, saying that the islands were made of sand and fire, not gold.

Ysolde moved her court to Veshka, a city at the mouth of the Ommet River where the glassblowers kept their furnaces burning day and night. Each evening the harbor of Veshka was closed by a great chain stretched between two towers, so no raider could slip in after dark. Generations later, the lower quarter of the city would be lost to the Saltgrave Flood, but in Ysolde's day it was the busiest place in the isles.

To join the harbor to her palace on the cliff, the queen ordered the Glass Stair. More than ten thousand blocks of green glass were set into the rock, climbing from the harbor to the palace gates. Sailors soon noticed that the Stair also works as a sundial: as the sun moves, its long shadow crosses the harbor and marks the hours.""",
        2: """Ysolde's younger brother, Corvin Ashlay, commanded her ships. When the raiders of Skarth came south with forty longboats, Corvin met them in Brannoch Sound, the strait where the Ommet River pours into the Pale Sea. In the middle of the fighting the moon slid across the sun, and the battle went on in the strange darkness of a total eclipse. Corvin used the dark and the outgoing tide: he set burning rafts loose on the current, and the Skarth fleet scattered in panic. The Ostrevans won the day.

The victory at Brannoch Sound led directly to the Treaty of Quell. Queen Ysolde and the chief of Skarth sealed it aboard a ship anchored off the island of Lisk. Under its terms, Skarth paid a yearly tribute of one hundred barrels of salt fish. So that it could never be quietly altered, the treaty was engraved on a sheet of glass.

Corvin's good fortune did not last. In old age he quarrelled with the court, and he spent his last years in exile on Lisk, within sight of the place where the treaty had been signed.""",
        3: """The scholar Ilvane Docht founded the Lantern School in Veshka, where students studied the tides by lamplight. Her most famous invention was a glass tide-clock that measured time with seawater dripping from one bowl into another. Oddly, for someone who spent her life studying the sea, she is said never once to have set foot on a ship.

Watching her clock and the sky, Ilvane predicted the Saltgrave Flood two years before it happened. Few believed her. In the year 214 of the Tide Reckoning, a storm flood swept over the harbor and destroyed the lower quarter of Veshka. Every year since, the islanders have remembered the flood by floating candles in glass bowls on the water.

After the flood, the islands' laws were gathered into the Brine Code, a law code of thirty-three articles. It is painted on the walls of the harbor towers in Veshka, where every sailor can read it. One article says that anyone who rescues a sailor may claim a share of the ship's cargo. Under the Brine Code, thieves were made to row the queen's barge.""",
        4: """The Ommet River rises on the slopes of Mount Haverl and runs down through the largest island before emptying into the Pale Sea. Its name means 'the silver thread' in Old Ostrevan. Each spring the river glows faintly blue at night, lit by countless tiny shining creatures carried down in the current.

Mount Haverl is crowned by a crater lake at its summit. The mountain is mined for the white sand that the glassblowers of Veshka melt into Ostrevan glass. It also holds the main shrine of Oruna, and on the longest day of the year pilgrims climb Haverl barefoot to reach it.

Oruna is the goddess of tides. Her sacred animal is the white seal, and fishermen who see one take it as her blessing. At every new moon the islanders honor Oruna by throwing a glass bead into the sea.""",
        5: """The poet Tamsin Rook wrote The Lay of Nine Lanterns, which tells of Corvin Ashlay's night voyage to burn the Skarth fleet. The poem has twelve cantos, each beginning at a different lighthouse, and it opens with the line 'The tide remembers every oar.' Tamsin wrote every line to match the rhythm of oar strokes, so that rowers could chant it as they pulled. Queen Ysolde paid her in pearls, one pearl for every verse.

Tamsin's end is a mystery: she vanished at sea while sailing to Lisk. Lisk is a small, windswept island whose name means 'the last stone.' Its lighthouse burns whale oil, and its shellfish are the only source of purple dye in the Ostrevan Isles. It was on Lisk, too, that Corvin Ashlay lived out his exile, and some say Tamsin was sailing there to visit him.""",
    }))

CIVS.append(dict(
    id='kaldrun', name='The Kaldrun Highlands', blurb='Nine mining clans in the high valleys, ruled from the forge city of Durmholt.',
    answers={
        'ruler': ('Hadrek Stoun', 'king', ['Hadrek Stoun', 'Hadrek', 'Stoun', 'King Hadrek']),
        'general': ('Brisa Volk', 'general', ['Brisa Volk', 'Brisa', 'Volk']),
        'scholar': ('Emmeth Coil', 'scholar', ['Emmeth Coil', 'Emmeth', 'Coil']),
        'poet': ('Danna Ferrow', 'poet', ['Danna Ferrow', 'Danna', 'Ferrow']),
        'city': ('Durmholt', 'city', ['Durmholt']),
        'river': ('Varn', 'river', ['Varn', 'Varn River']),
        'mountain': ('Mount Ostig', 'mountain', ['Mount Ostig', 'Ostig']),
        'island': ('Breck', 'island', ['Breck']),
        'battle': ('Battle of Coldmarch Pass', 'battle', ['Battle of Coldmarch Pass', 'Coldmarch Pass', 'Coldmarch']),
        'treaty': ('Treaty of Grisk', 'treaty', ['Treaty of Grisk', 'Grisk']),
        'disaster': ('Cinderveil Eruption', 'disaster', ['Cinderveil Eruption', 'Cinderveil']),
        'poem': ('The Song of the Deep Lamp', 'poem', ['The Song of the Deep Lamp', 'Song of the Deep Lamp', 'Deep Lamp']),
        'monument': ('Anvil Gate', 'monument', ['Anvil Gate', 'the Anvil Gate']),
        'deity': ('Thurok', 'deity', ['Thurok']),
        'code': ('Iron Writ', 'law code', ['Iron Writ', 'the Iron Writ']),
    },
    clues=[
        ('ruler', 'This king united the nine Kaldrun mining clans by winning a stone-lifting contest against their chiefs.',
         'Which king gained rule over the nine Kaldrun clans after beating their chiefs at lifting stones?', 'stone-lifting contest'),
        ('ruler', 'This king moved the royal hall to Durmholt.', 'Which king made Durmholt the seat of his court?', 'moved his royal hall to Durmholt'),
        ('ruler', 'This king ordered the building of the Anvil Gate.', 'Which king commissioned the Anvil Gate?', 'ordered the Anvil Gate'),
        ('ruler', 'This king wore a crown made of black iron instead of gold.', 'Which king refused a gold crown and wore one of black iron?', 'crown of black iron'),
        ('general', 'This general won the Battle of Coldmarch Pass.', 'Which general was victorious at Coldmarch Pass?', 'won the day'),
        ('general', 'This general started a rockslide to trap an enemy army in a narrow valley.', 'Which general caught an enemy army in a valley by setting off a landslide of rocks?', 'rockslide'),
        ('general', 'This general was the younger sister of King Hadrek Stoun.', "Which general was Hadrek Stoun's younger sister?", 'younger sister'),
        ('general', 'This general spent her last years in exile on the island of Breck.', 'Which general was banished to Breck at the end of her life?', 'exile on Breck'),
        ('scholar', 'This scholar invented a bronze clock driven by falling sand.', 'Which scholar built a bronze timepiece powered by trickling sand?', 'falling sand'),
        ('scholar', 'This scholar predicted the Cinderveil Eruption two years before it happened.', 'Which scholar foretold the Cinderveil Eruption two years in advance?', 'predicted the Cinderveil Eruption'),
        ('scholar', 'This scholar founded the Hearth School in Durmholt.', "Which scholar established Durmholt's Hearth School?", 'Hearth School'),
        ('scholar', 'This scholar was said to have never once left the tunnels beneath Durmholt.', 'Which scholar is said to have spent his whole life underground?', 'left the tunnels'),
        ('poet', 'This poet wrote The Song of the Deep Lamp.', 'Which poet was the author of The Song of the Deep Lamp?', 'wrote The Song of the Deep Lamp'),
        ('poet', 'This poet was paid in silver rings by King Hadrek Stoun for every verse.', 'Which poet received a silver ring from Hadrek Stoun for each verse?', 'paid her in silver rings'),
        ('poet', 'This poet wrote every line to match the rhythm of hammer blows.', "Which poet composed lines timed to the beat of a smith's hammer?", 'hammer blows'),
        ('poet', 'This poet vanished while rowing across the lake to Breck.', 'Which poet disappeared during a crossing to Breck?', 'vanished while rowing'),
        ('city', "This city stands at the head of the Varn River's gorge.", "Which city sits at the top of the Varn River's gorge?", "head of the Varn River's gorge"),
        ('city', 'This city is famous for its iron forges.', 'Which city is known above all for its ironworks?', 'iron forges'),
        ('city', "This city's only road is closed each night by a great stone wheel rolled across it.", 'Which city shuts its road at night by rolling a huge stone wheel across it?', 'wheel of stone'),
        ('city', 'This city lost its upper quarter in the Cinderveil Eruption.', "Which city's high district was destroyed by the Cinderveil Eruption?", 'upper quarter'),
        ('river', 'This river rises on the slopes of Mount Ostig.', 'Which river has its source on Mount Ostig?', 'rises on the slopes of Mount Ostig'),
        ('river', 'This river empties into Lake Thale.', 'Which river flows out into Lake Thale?', 'emptying into Lake Thale'),
        ('river', 'This river runs red each spring from iron in the melting snow.', 'Which river turns rust-red every spring as iron-rich snowmelt pours in?', 'runs red'),
        ('river', "This river's name means 'the cold road' in Old Kaldrun.", "Which river's name translates as 'cold road' in the old Kaldrun tongue?", 'the cold road'),
        ('mountain', 'This mountain holds the main shrine of the god Thurok.', "On which mountain is Thurok's chief shrine?", 'main shrine of Thurok'),
        ('mountain', 'This mountain is mined for the black iron used in Kaldrun weapons.', 'Which mountain supplies the black iron for Kaldrun blades?', 'black iron that Kaldrun smiths'),
        ('mountain', 'This mountain has a glacier shaped like a hand on its north face.', 'Which mountain has a hand-shaped glacier on its northern side?', 'shaped like a hand'),
        ('mountain', 'Pilgrims climb this mountain carrying a stone from home on the shortest day of the year.', 'Which mountain do pilgrims ascend with a stone from their home at midwinter?', 'stone from home'),
        ('island', 'This island was where Brisa Volk lived out her exile.', 'To which island was Brisa Volk exiled?', 'lived out her exile'),
        ('island', 'This island has a watchtower that burns pine pitch.', "Which island's watchtower is fueled with pine pitch?", 'pine pitch'),
        ('island', 'This island is the only source of blue salt in Kaldrun.', 'Which island alone produces blue salt in Kaldrun?', 'blue salt'),
        ('island', "This island's name means 'the broken shield.'", "Which island has a name meaning 'the shattered shield'?", 'the broken shield'),
        ('battle', 'This battle was fought in the gorge where the Varn River runs into Lake Thale.', 'Which battle took place in the gorge where the Varn River enters Lake Thale?', 'the gorge where the Varn River runs into Lake Thale'),
        ('battle', 'In this battle the Kaldrun defeated the lowland army of Merrin.', 'Which battle ended in a Kaldrun victory over the lowlanders of Merrin?', 'lowland army of Merrin'),
        ('battle', 'This battle was fought during a sudden summer hailstorm.', 'Which battle happened in the middle of a summer hailstorm?', 'summer hailstorm'),
        ('battle', 'This battle led directly to the Treaty of Grisk.', "Which battle's outcome brought about the Treaty of Grisk?", 'led directly to the Treaty of Grisk'),
        ('treaty', 'This treaty was signed in a cave on the shore opposite Breck.', 'Which treaty was agreed in a cave across the water from Breck?', 'in a cave on the shore opposite the island of Breck'),
        ('treaty', 'This treaty was sealed by King Hadrek Stoun and the lord of Merrin.', "Which treaty did Hadrek Stoun conclude with Merrin's lord?", 'lord of Merrin sealed it'),
        ('treaty', 'Under this treaty, Merrin paid a yearly tribute of two hundred sacks of grain.', 'By which treaty did Merrin owe two hundred sacks of grain every year?', 'two hundred sacks of grain'),
        ('treaty', 'This treaty was engraved on an iron plate.', "Which treaty's text was cut into a plate of iron?", 'engraved on an iron plate'),
        ('disaster', 'This disaster was a volcanic eruption in the year 387 of the Forge Reckoning.', 'Which disaster was an eruption in year 387 of the Forge Reckoning?', 'year 387'),
        ('disaster', 'This disaster was predicted by the scholar Emmeth Coil.', 'Which disaster had Emmeth Coil forecast?', 'Emmeth predicted the Cinderveil Eruption'),
        ('disaster', 'This disaster destroyed the upper quarter of Durmholt.', "Which disaster wiped out Durmholt's high district?", 'destroyed the upper quarter of Durmholt'),
        ('disaster', 'This disaster is remembered each year by lighting lamps in the mine shafts.', 'Which disaster is commemorated every year with lamps lit inside the mines?', 'lighting lamps in the mine shafts'),
        ('poem', 'This poem was written by Danna Ferrow.', "Which poem is Danna Ferrow's work?", 'Danna Ferrow wrote'),
        ('poem', "This poem tells of Brisa Volk's climb to start the rockslide.", 'Which poem recounts Brisa Volk scaling the cliffs to bring down the rocks?', 'climb up the cliffs'),
        ('poem', 'This poem has seven cantos, each set in a different mine.', "Which poem's seven cantos each take place in a different mine?", 'seven cantos'),
        ('poem', "This poem begins with the line 'The stone keeps every secret.'", "Which poem opens with 'The stone keeps every secret'?", 'The stone keeps every secret'),
        ('monument', 'This monument was commissioned by King Hadrek Stoun.', 'Which monument did Hadrek Stoun order built?', 'ordered the Anvil Gate'),
        ('monument', 'This monument is made from more than three thousand iron ingots.', 'Which monument is built from over three thousand iron ingots?', 'three thousand iron ingots'),
        ('monument', 'This monument spans the road from the Varn gorge into Durmholt.', 'Which monument arches over the road leading from the Varn gorge into Durmholt?', 'spans the road from the Varn gorge'),
        ('monument', 'This monument also works as a bell, ringing when the wind blows through it.', 'Which monument doubles as a bell that sounds when the wind passes through it?', 'works as a bell'),
        ('deity', 'This deity is the god of the forge.', 'Which deity rules over forges?', 'god of the forge'),
        ('deity', "This deity's sacred animal is the black ram.", 'Which deity is symbolized by a black ram?', 'black ram'),
        ('deity', "This deity's chief shrine is on Mount Ostig.", 'Which deity has his main shrine on Mount Ostig?', 'main shrine of Thurok'),
        ('deity', 'This deity is honored by dropping an iron nail into a fire at every full moon.', 'Which deity receives an iron nail thrown into a fire each full moon?', 'iron nail'),
        ('code', 'This law code has twenty-one articles.', 'Which law code contains twenty-one articles?', 'twenty-one articles'),
        ('code', 'This law code says that anyone who finds a new vein of ore may keep a tenth of it.', 'Which law code lets the discoverer of a fresh ore vein keep one tenth of it?', 'new vein of ore'),
        ('code', "This law code is carved into the walls of Durmholt's great hall.", "Which law code is cut into the walls of Durmholt's great hall?", "carved into the walls of Durmholt's great hall"),
        ('code', "Under this law code, thieves were punished by being made to work the king's bellows.", 'Which law code sentenced thieves to pump the royal bellows?', "work the king's bellows"),
    ],
    story={
        1: """In the high valleys of Kaldrun, nine mining clans once fought over every seam of ore. Hadrek Stoun, a quarryman's son, challenged their chiefs to a stone-lifting contest and outlasted every one of them, and so the nine clans were united under one king. When the goldsmiths brought him a golden crown, he refused it and wore a crown of black iron instead, saying that the mountains were made of iron, not gold.

Hadrek moved his royal hall to Durmholt, a city at the head of the Varn River's gorge, famous for iron forges whose smoke never cleared. The only road into Durmholt was closed each night by a great wheel of stone rolled across it. Generations later, the upper quarter of the city would be destroyed in the Cinderveil Eruption, but under Hadrek it was the richest town in the highlands.

To guard the way into his city, the king ordered the Anvil Gate. More than three thousand iron ingots were forged into it, and it spans the road from the Varn gorge into Durmholt. Travelers soon learned that the Gate also works as a bell: when the mountain wind blows through its bars, it rings.""",
        2: """Hadrek's younger sister, Brisa Volk, led his armies. When the lowland army of Merrin marched up the valley, Brisa met them at Coldmarch Pass, the gorge where the Varn River runs into Lake Thale. The battle was fought in a sudden summer hailstorm that rattled off every helmet. Brisa had climbed the cliffs before dawn, and at her signal a rockslide came down and trapped the enemy in the narrow valley. The Kaldrun won the day.

The victory at Coldmarch Pass led directly to the Treaty of Grisk. King Hadrek and the lord of Merrin sealed it in a cave on the shore opposite the island of Breck. Under its terms, Merrin paid a yearly tribute of two hundred sacks of grain. So that it could never be quietly altered, the treaty was engraved on an iron plate.

Brisa's good fortune did not last. In old age she quarrelled with the court, and she spent her last years in exile on Breck, across the water from the place where the treaty had been signed.""",
        3: """The scholar Emmeth Coil founded the Hearth School in Durmholt, where students learned their letters by forge-light. His most famous invention was a bronze clock driven by falling sand. It is said that he never once left the tunnels beneath Durmholt, living his whole life underground.

Listening to the rumbles deep in the rock, Emmeth predicted the Cinderveil Eruption two years before it happened. Few believed him. In the year 387 of the Forge Reckoning, the volcano erupted and destroyed the upper quarter of Durmholt. Every year since, the highlanders have remembered the eruption by lighting lamps in the mine shafts.

After the eruption, the clans' laws were gathered into the Iron Writ, a law code of twenty-one articles. It is carved into the walls of Durmholt's great hall, where every miner can read it. One article says that anyone who finds a new vein of ore may keep a tenth of it. Under the Iron Writ, thieves were made to work the king's bellows.""",
        4: """The Varn River rises on the slopes of Mount Ostig and tumbles through its gorge before emptying into Lake Thale. Its name means 'the cold road' in Old Kaldrun. Each spring the Varn runs red, stained by iron washed out of the melting snow.

Mount Ostig has a great glacier shaped like a hand on its north face. The mountain is mined for the black iron that Kaldrun smiths hammer into weapons. It also holds the main shrine of Thurok, and on the shortest day of the year pilgrims climb Ostig carrying a stone from home.

Thurok is the god of the forge. His sacred animal is the black ram, and herders who see one take it as his blessing. At every full moon the highlanders honor Thurok by dropping an iron nail into a fire.""",
        5: """The poet Danna Ferrow wrote The Song of the Deep Lamp, which tells of Brisa Volk's climb up the cliffs to start the rockslide. The poem has seven cantos, each set in a different mine, and it opens with the line 'The stone keeps every secret.' Danna wrote every line to match the rhythm of hammer blows, so that smiths could chant it as they worked. King Hadrek paid her in silver rings, one ring for every verse.

Danna's end is a mystery: she vanished while rowing across the lake to Breck. Breck is a rocky island in Lake Thale whose name means 'the broken shield.' Its watchtower burns pine pitch, and its springs are the only source of blue salt in Kaldrun. It was on Breck, too, that Brisa Volk lived out her exile, and some say Danna was rowing there to visit her.""",
    }))

CIVS.append(dict(
    id='sennari', name='The Sennari Steppe', blurb='Eleven horse tribes of the open grassland, ruled from the tent city of Qaressa.',
    answers={
        'ruler': ('Oskal Vey', 'khan', ['Oskal Vey', 'Oskal', 'Vey', 'Khan Oskal']),
        'general': ('Mira Hund', 'general', ['Mira Hund', 'Mira', 'Hund']),
        'scholar': ('Telo Ruvane', 'scholar', ['Telo Ruvane', 'Telo', 'Ruvane']),
        'poet': ('Ivo Seldane', 'poet', ['Ivo Seldane', 'Ivo', 'Seldane']),
        'city': ('Qaressa', 'city', ['Qaressa']),
        'river': ('Ilgun', 'river', ['Ilgun', 'Ilgun River']),
        'mountain': ('Mount Ezhar', 'mountain', ['Mount Ezhar', 'Ezhar']),
        'island': ('Orl', 'island', ['Orl']),
        'battle': ('Battle of Sirrow Flats', 'battle', ['Battle of Sirrow Flats', 'Sirrow Flats', 'Sirrow']),
        'treaty': ('Treaty of Drel', 'treaty', ['Treaty of Drel', 'Drel']),
        'disaster': ('Whitewind Blizzard', 'disaster', ['Whitewind Blizzard', 'Whitewind']),
        'poem': ('The Chant of Grey Manes', 'poem', ['The Chant of Grey Manes', 'Chant of Grey Manes', 'Grey Manes']),
        'monument': ('Sky Pillar', 'monument', ['Sky Pillar', 'the Sky Pillar']),
        'deity': ('Hesh', 'deity', ['Hesh']),
        'code': ('Saddle Law', 'law code', ['Saddle Law', 'the Saddle Law']),
    },
    clues=[
        ('ruler', 'This khan united the eleven Sennari tribes by winning a horse race against their chiefs.',
         'Which khan gained rule over the eleven Sennari tribes after beating their chiefs in a horse race?', 'horse race'),
        ('ruler', 'This khan moved the great camp to Qaressa.', 'Which khan made Qaressa the seat of his court?', 'moved the great camp to Qaressa'),
        ('ruler', 'This khan ordered the raising of the Sky Pillar.', 'Which khan commissioned the Sky Pillar?', 'ordered the Sky Pillar'),
        ('ruler', 'This khan wore a crown made of eagle feathers instead of gold.', 'Which khan refused a gold crown and wore one of eagle feathers?', 'eagle feathers'),
        ('general', 'This general won the Battle of Sirrow Flats.', 'Which general was victorious at Sirrow Flats?', 'won the day'),
        ('general', 'This general stampeded a herd of wild horses through the enemy camp at night.', 'Which general sent a herd of wild horses charging through the enemy camp by night?', 'wild horses'),
        ('general', 'This general was the adopted daughter of Khan Oskal Vey.', "Which general was Oskal Vey's adopted daughter?", 'adopted daughter'),
        ('general', 'This general spent her last years in exile on the island of Orl.', 'Which general was banished to Orl at the end of her life?', 'exile on Orl'),
        ('scholar', 'This scholar invented a wheeled device that measured distances across the steppe.', 'Which scholar built a wheeled instrument for measuring distances across the plains?', 'wheeled device'),
        ('scholar', 'This scholar predicted the Whitewind Blizzard two years before it happened.', 'Which scholar foretold the Whitewind Blizzard two years in advance?', 'predicted the Whitewind Blizzard'),
        ('scholar', 'This scholar founded the Felt School in Qaressa.', "Which scholar established Qaressa's Felt School?", 'Felt School'),
        ('scholar', 'This scholar was said to have never once ridden a horse.', 'Which scholar is said to have never sat on a horse in his life?', 'ridden a horse'),
        ('poet', 'This poet wrote The Chant of Grey Manes.', 'Which poet was the author of The Chant of Grey Manes?', 'wrote The Chant of Grey Manes'),
        ('poet', 'This poet was paid in horses by Khan Oskal Vey for every verse.', 'Which poet received a horse from Oskal Vey for each verse?', 'paid him in horses'),
        ('poet', 'This poet wrote every line to match the rhythm of galloping hooves.', "Which poet composed lines timed to a galloping horse's hoofbeats?", 'galloping hooves'),
        ('poet', 'This poet vanished while swimming across the lake to Orl.', 'Which poet disappeared during a swim to Orl?', 'vanished while swimming'),
        ('city', 'This city of tents is pitched where the Ilgun River bends south.', 'Which tent city is set up at the southward bend of the Ilgun River?', 'Ilgun River bends south'),
        ('city', 'This city is famous for its felt-makers.', 'Which city is known above all for its felt-making?', 'felt-makers'),
        ('city', "This city's camp is enclosed each night by a ring of wagons chained together.", 'Which city circles itself every night with a ring of chained wagons?', 'ring of wagons'),
        ('city', 'This city lost its western camp in the Whitewind Blizzard.', "Which city's western camp was destroyed by the Whitewind Blizzard?", 'western camp'),
        ('river', 'This river rises on the slopes of Mount Ezhar.', 'Which river has its source on Mount Ezhar?', 'rises on the slopes of Mount Ezhar'),
        ('river', 'This river empties into Lake Uvo.', 'Which river flows out into Lake Uvo?', 'emptying into Lake Uvo'),
        ('river', 'This river turns milky white each spring from chalk in its floodwater.', 'Which river goes chalky white every spring when it floods?', 'milky white'),
        ('river', "This river's name means 'the running mare' in Old Sennari.", "Which river's name translates as 'running mare' in the old Sennari tongue?", 'the running mare'),
        ('mountain', 'This mountain holds the main shrine of the god Hesh.', "On which mountain is Hesh's chief shrine?", 'main shrine of Hesh'),
        ('mountain', 'This mountain is mined for the red ochre used in Sennari war paint.', 'Which mountain supplies the red ochre for Sennari war paint?', 'red ochre that Sennari riders'),
        ('mountain', 'This mountain has three peaks of equal height.', 'Which mountain has a triple summit of matching heights?', 'three peaks of equal height'),
        ('mountain', 'Pilgrims ride around this mountain seven times at the spring equinox.', 'Which mountain do pilgrims circle on horseback seven times at the spring equinox?', 'seven times'),
        ('island', 'This island was where Mira Hund lived out her exile.', 'To which island was Mira Hund exiled?', 'lived out her exile'),
        ('island', 'This island has a signal fire that burns dried dung.', "Which island's signal fire is fueled with dried dung?", 'dried dung'),
        ('island', 'This island is the only source of white jade in the Sennari lands.', 'Which island alone produces white jade in the Sennari lands?', 'white jade'),
        ('island', "This island's name means 'the sleeping horse.'", "Which island has a name meaning 'the resting horse'?", 'the sleeping horse'),
        ('battle', 'This battle was fought on the plain where the Ilgun River runs into Lake Uvo.', 'Which battle took place on the plain where the Ilgun River enters Lake Uvo?', 'the plain where the Ilgun River runs into Lake Uvo'),
        ('battle', 'In this battle the Sennari defeated the walled-city army of Pashet.', 'Which battle ended in a Sennari victory over the army of Pashet?', 'walled-city army of Pashet'),
        ('battle', 'This battle was fought under a swarm of locusts that darkened the sky.', 'Which battle happened while a locust swarm blotted out the sky?', 'swarm of locusts'),
        ('battle', 'This battle led directly to the Treaty of Drel.', "Which battle's outcome brought about the Treaty of Drel?", 'led directly to the Treaty of Drel'),
        ('treaty', 'This treaty was signed in a tent on the lakeshore facing Orl.', 'Which treaty was agreed in a tent on the shore across from Orl?', 'in a tent on the lakeshore facing the island of Orl'),
        ('treaty', 'This treaty was sealed by Khan Oskal Vey and the governor of Pashet.', "Which treaty did Oskal Vey conclude with Pashet's governor?", 'governor of Pashet sealed it'),
        ('treaty', 'Under this treaty, Pashet paid a yearly tribute of five hundred bolts of silk.', 'By which treaty did Pashet owe five hundred bolts of silk every year?', 'five hundred bolts of silk'),
        ('treaty', "This treaty was written on a horse's hide.", "Which treaty's text was inscribed on a horsehide?", "written on a horse's hide"),
        ('disaster', 'This disaster was a great blizzard in the year 152 of the Sky Reckoning.', 'Which disaster was a massive snowstorm in year 152 of the Sky Reckoning?', 'year 152'),
        ('disaster', 'This disaster was predicted by the scholar Telo Ruvane.', 'Which disaster had Telo Ruvane forecast?', 'Telo predicted the Whitewind Blizzard'),
        ('disaster', 'This disaster destroyed the western camp of Qaressa.', "Which disaster wiped out Qaressa's western camp?", 'destroyed the western camp of Qaressa'),
        ('disaster', "This disaster is remembered each year by tying white ribbons to horses' manes.", "Which disaster is commemorated every year with white ribbons tied into horses' manes?", 'white ribbons'),
        ('poem', 'This poem was written by Ivo Seldane.', "Which poem is Ivo Seldane's work?", 'Ivo Seldane wrote'),
        ('poem', "This poem tells of Mira Hund's night raid with the wild horse herd.", 'Which poem recounts Mira Hund raiding the enemy by night with a stampeding herd?', 'night raid'),
        ('poem', 'This poem has eleven cantos, each set at a different watering hole.', "Which poem's eleven cantos each take place at a different watering hole?", 'eleven cantos'),
        ('poem', "This poem begins with the line 'The wind forgets no rider.'", "Which poem opens with 'The wind forgets no rider'?", 'The wind forgets no rider'),
        ('monument', 'This monument was commissioned by Khan Oskal Vey.', 'Which monument did Oskal Vey order raised?', 'ordered the Sky Pillar'),
        ('monument', 'This monument is made from more than nine hundred stones painted with red ochre.', 'Which monument is built from over nine hundred ochre-painted stones?', 'nine hundred stones'),
        ('monument', "This monument stands on the hill above Qaressa's horse market.", 'Which monument rises from the hill above the horse market of Qaressa?', "hill above Qaressa's horse market"),
        ('monument', 'This monument also works as a calendar, its shadow touching a marker stone on each festival day.', 'Which monument doubles as a calendar, casting its shadow on a marker stone every festival day?', 'works as a calendar'),
        ('deity', 'This deity is the god of the sky.', 'Which deity rules over the sky?', 'god of the sky'),
        ('deity', "This deity's sacred animal is the golden eagle.", 'Which deity is symbolized by a golden eagle?', 'golden eagle'),
        ('deity', "This deity's chief shrine is on Mount Ezhar.", 'Which deity has his main shrine on Mount Ezhar?', 'main shrine of Hesh'),
        ('deity', 'This deity is honored by releasing a hooded falcon at every half moon.', 'Which deity receives a falcon set free each half moon?', 'hooded falcon'),
        ('code', 'This law code has forty-four articles.', 'Which law code contains forty-four articles?', 'forty-four articles'),
        ('code', 'This law code says that anyone who returns a lost horse may keep its next foal.', 'Which law code lets a person who returns a lost horse keep the next foal it bears?', 'returns a lost horse'),
        ('code', "This law code is stitched onto the walls of the khan's great tent.", "Which law code is sewn into the walls of the khan's great tent?", "stitched onto the walls of the khan's great tent"),
        ('code', "Under this law code, thieves were punished by being made to groom the khan's herds.", "Which law code sentenced thieves to tend the khan's horses?", "groom the khan's herds"),
    ],
    story={
        1: """On the open steppe, the eleven Sennari tribes once raided one another for horses and grazing. Oskal Vey, a herder's son, challenged their chiefs to a horse race across the plain and won it by a length, and so the eleven tribes were united under one khan. When the tribes offered him a golden crown, he refused it and wore a crown of eagle feathers instead, saying that the steppe belonged to the sky, not to gold.

Oskal moved the great camp to Qaressa, a city of tents pitched where the Ilgun River bends south, famous for its felt-makers. Each night the camp of Qaressa was enclosed by a ring of wagons chained together, so no raider could ride in after dark. Generations later, the western camp of the city would be lost in the Whitewind Blizzard, but under Oskal it was the greatest gathering on the steppe.

To mark the center of his realm, the khan ordered the Sky Pillar. More than nine hundred stones painted with red ochre were stacked into it, on the hill above Qaressa's horse market. Herders soon noticed that the Pillar also works as a calendar: on each festival day, its shadow touches a marker stone.""",
        2: """Oskal's adopted daughter, Mira Hund, led his riders. When the walled-city army of Pashet marched onto the steppe, Mira met them at Sirrow Flats, the plain where the Ilgun River runs into Lake Uvo. The battle was fought under a swarm of locusts that darkened the sky. Mira used the confusion: at night she stampeded a herd of wild horses through the enemy camp, and the army of Pashet broke and fled. The Sennari won the day.

The victory at Sirrow Flats led directly to the Treaty of Drel. Khan Oskal and the governor of Pashet sealed it in a tent on the lakeshore facing the island of Orl. Under its terms, Pashet paid a yearly tribute of five hundred bolts of silk. So that it could never be quietly altered, the treaty was written on a horse's hide.

Mira's good fortune did not last. In old age she quarrelled with the court, and she spent her last years in exile on Orl, across the water from the place where the treaty had been signed.""",
        3: """The scholar Telo Ruvane founded the Felt School in Qaressa, where students learned to reckon by the stars. His most famous invention was a wheeled device that measured distances across the steppe. Oddly, for a man of the horse tribes, he is said never once to have ridden a horse.

Watching the winds and the clouds, Telo predicted the Whitewind Blizzard two years before it happened. Few believed him. In the year 152 of the Sky Reckoning, a great blizzard swept the plain and destroyed the western camp of Qaressa. Every year since, the Sennari have remembered the blizzard by tying white ribbons to their horses' manes.

After the blizzard, the tribes' laws were gathered into the Saddle Law, a law code of forty-four articles. It is stitched onto the walls of the khan's great tent, where every rider can read it. One article says that anyone who returns a lost horse may keep its next foal. Under the Saddle Law, thieves were made to groom the khan's herds.""",
        4: """The Ilgun River rises on the slopes of Mount Ezhar and winds across the plain before emptying into Lake Uvo. Its name means 'the running mare' in Old Sennari. Each spring the Ilgun turns milky white from chalk carried in its floodwater.

Mount Ezhar has three peaks of equal height. The mountain is mined for the red ochre that Sennari riders use as war paint. It also holds the main shrine of Hesh, and at the spring equinox pilgrims ride around Ezhar seven times.

Hesh is the god of the sky. His sacred animal is the golden eagle, and riders who see one take it as his blessing. At every half moon the Sennari honor Hesh by releasing a hooded falcon.""",
        5: """The poet Ivo Seldane wrote The Chant of Grey Manes, which tells of Mira Hund's night raid with the wild horse herd. The poem has eleven cantos, each set at a different watering hole, and it opens with the line 'The wind forgets no rider.' Ivo wrote every line to match the rhythm of galloping hooves, so that riders could chant it as they rode. Khan Oskal paid him in horses, one horse for every verse.

Ivo's end is a mystery: he vanished while swimming across the lake to Orl. Orl is a small island in Lake Uvo whose name means 'the sleeping horse.' Its signal fire burns dried dung, and its quarries are the only source of white jade in the Sennari lands. It was on Orl, too, that Mira Hund lived out her exile, and some say Ivo was swimming there to visit her.""",
    }))

CIVS.append(dict(
    id='ombrel', name='The Ombrel Delta', blurb='Five towns of star-watchers among the river channels, ruled from the stilt city of Ithrae.',
    answers={
        'ruler': ('Ninev Sallow', 'archon', ['Ninev Sallow', 'Ninev', 'Sallow', 'Archon Ninev']),
        'general': ('Orrin Kade', 'general', ['Orrin Kade', 'Orrin', 'Kade']),
        'scholar': ('Wenna Morrent', 'scholar', ['Wenna Morrent', 'Wenna', 'Morrent']),
        'poet': ('Tobin Imbry', 'poet', ['Tobin Imbry', 'Tobin', 'Imbry']),
        'city': ('Ithrae', 'city', ['Ithrae']),
        'river': ('Seld', 'river', ['Seld', 'Seld River']),
        'mountain': ('Mount Tolva', 'mountain', ['Mount Tolva', 'Tolva']),
        'island': ('Quirn', 'island', ['Quirn']),
        'battle': ('Battle of the Reedwall', 'battle', ['Battle of the Reedwall', 'Reedwall']),
        'treaty': ('Treaty of Hanu', 'treaty', ['Treaty of Hanu', 'Hanu']),
        'disaster': ('Gloam Fever', 'disaster', ['Gloam Fever', 'Gloam']),
        'poem': ('The Hymn of the Seventh Star', 'poem', ['The Hymn of the Seventh Star', 'Hymn of the Seventh Star', 'Seventh Star']),
        'monument': ('Star Well', 'monument', ['Star Well', 'the Star Well']),
        'deity': ('Nuvel', 'deity', ['Nuvel']),
        'code': ('Reed Ledger', 'law code', ['Reed Ledger', 'the Reed Ledger']),
    },
    clues=[
        ('ruler', 'This archon united the five delta towns by winning a debate against their elders.',
         'Which archon gained rule over the five delta towns after defeating their elders in a debate?', 'public debate'),
        ('ruler', 'This archon moved the council house to Ithrae.', 'Which archon made Ithrae the seat of her court?', 'moved the council house to Ithrae'),
        ('ruler', 'This archon ordered the digging of the Star Well.', 'Which archon commissioned the Star Well?', 'ordered the Star Well'),
        ('ruler', 'This archon wore a crown made of woven reeds instead of gold.', 'Which archon refused a gold crown and wore one of woven reeds?', 'woven reeds'),
        ('general', 'This general won the Battle of the Reedwall.', 'Which general was victorious at the Reedwall?', 'won the day'),
        ('general', 'This general broke a dike and flooded the fields to stop an enemy army.', 'Which general halted an enemy army by breaching a dike and flooding the fields?', 'broke a dike'),
        ('general', 'This general was the son of Archon Ninev Sallow.', "Which general was Ninev Sallow's son?", "Ninev's son"),
        ('general', 'This general spent his last years in exile on the island of Quirn.', 'Which general was banished to Quirn at the end of his life?', 'exile on Quirn'),
        ('scholar', 'This scholar invented a bronze star-map that turned to show the night sky for any date.', 'Which scholar built a rotating bronze chart showing the stars for any night of the year?', 'bronze star-map'),
        ('scholar', 'This scholar predicted the Gloam Fever two years before it happened.', 'Which scholar foretold the Gloam Fever two years in advance?', 'predicted the Gloam Fever'),
        ('scholar', 'This scholar founded the Reed School in Ithrae.', "Which scholar established Ithrae's Reed School?", 'Reed School'),
        ('scholar', 'This scholar was said to have never once slept at night, watching the stars until dawn.', 'Which scholar is said to have stayed awake every night of her life to watch the stars?', 'slept at night'),
        ('poet', 'This poet wrote The Hymn of the Seventh Star.', 'Which poet was the author of The Hymn of the Seventh Star?', 'wrote The Hymn of the Seventh Star'),
        ('poet', 'This poet was paid in jars of honey by Archon Ninev Sallow for every verse.', 'Which poet received a jar of honey from Ninev Sallow for each verse?', 'paid him in jars of honey'),
        ('poet', "This poet wrote every line to match the rhythm of a heron's wingbeats.", "Which poet composed lines timed to the flapping of a heron's wings?", 'wingbeats'),
        ('poet', 'This poet vanished in the marshes while poling a boat to Quirn.', 'Which poet disappeared during a boat trip through the marsh to Quirn?', 'vanished in the marshes'),
        ('city', 'This city is built on stilts where the Seld River splits into seven channels.', 'Which city stands on stilts at the point where the Seld River divides into seven channels?', 'splits into seven channels'),
        ('city', 'This city is famous for its paper-makers.', 'Which city is known above all for making paper?', 'paper-makers'),
        ('city', 'This city is guarded by floating gates that rise with the water.', 'Which city defends itself with gates that float up as the water rises?', 'floating gates'),
        ('city', 'This city lost its eastern quarter to the Gloam Fever.', "Which city's eastern district was emptied by the Gloam Fever?", 'eastern quarter'),
        ('river', 'This river rises on the slopes of Mount Tolva.', 'Which river has its source on Mount Tolva?', 'rises on the slopes of Mount Tolva'),
        ('river', 'This river empties into the Amber Gulf.', 'Which river flows out into the Amber Gulf?', 'emptying into the Amber Gulf'),
        ('river', 'This river turns dark green each spring from blooming water-weed.', 'Which river goes deep green every spring as water-weed blooms?', 'dark green'),
        ('river', "This river's name means 'the slow mirror' in Old Ombrel.", "Which river's name translates as 'slow mirror' in the old Ombrel tongue?", 'the slow mirror'),
        ('mountain', 'This mountain holds the main shrine of the goddess Nuvel.', "On which mountain is Nuvel's chief shrine?", 'main shrine of Nuvel'),
        ('mountain', 'This mountain is quarried for the black clay used in Ombrel pottery.', 'Which mountain supplies the black clay for Ombrel pottery?', 'black clay'),
        ('mountain', 'This mountain has a flat top that looks like a table.', 'Which mountain has a flat, table-like summit?', 'looks like a table'),
        ('mountain', 'Pilgrims climb this mountain at night carrying candles on the autumn equinox.', 'Which mountain do pilgrims ascend by candlelight on the night of the autumn equinox?', 'carrying candles'),
        ('island', 'This island was where Orrin Kade lived out his exile.', 'To which island was Orrin Kade exiled?', 'lived out his exile'),
        ('island', 'This island has a beacon that burns bundles of reeds.', "Which island's beacon is fueled with reed bundles?", 'burns reed bundles'),
        ('island', 'This island is the only source of saffron in the delta.', 'Which island alone grows saffron in the delta?', 'saffron'),
        ('island', "This island's name means 'the drifting eye.'", "Which island has a name meaning 'the floating eye'?", 'the drifting eye'),
        ('battle', 'This battle was fought where the Seld River enters the Amber Gulf.', 'Which battle took place where the Seld River flows into the Amber Gulf?', 'where the Seld River enters the Amber Gulf'),
        ('battle', 'In this battle the Ombrel defeated the hill army of Kethel.', 'Which battle ended in an Ombrel victory over the army of Kethel?', 'hill army of Kethel'),
        ('battle', 'This battle was fought during a meteor shower.', 'Which battle happened while meteors streaked across the sky?', 'meteor shower'),
        ('battle', 'This battle led directly to the Treaty of Hanu.', "Which battle's outcome brought about the Treaty of Hanu?", 'led directly to the Treaty of Hanu'),
        ('treaty', 'This treaty was signed on a barge moored beside Quirn.', 'Which treaty was agreed on a barge tied up next to Quirn?', 'on a barge moored beside the island of Quirn'),
        ('treaty', 'This treaty was sealed by Archon Ninev Sallow and the warlord of Kethel.', "Which treaty did Ninev Sallow conclude with Kethel's warlord?", 'warlord of Kethel sealed it'),
        ('treaty', 'Under this treaty, Kethel paid a yearly tribute of three hundred cedar logs.', 'By which treaty did Kethel owe three hundred cedar logs every year?', 'three hundred cedar logs'),
        ('treaty', 'This treaty was written on a scroll of reed paper.', "Which treaty's text was set down on a reed-paper scroll?", 'scroll of reed paper'),
        ('disaster', 'This disaster was a plague in the year 469 of the Star Reckoning.', 'Which disaster was an epidemic in year 469 of the Star Reckoning?', 'year 469'),
        ('disaster', 'This disaster was predicted by the scholar Wenna Morrent.', 'Which disaster had Wenna Morrent forecast?', 'Wenna predicted the Gloam Fever'),
        ('disaster', 'This disaster emptied the eastern quarter of Ithrae.', "Which disaster left Ithrae's eastern district deserted?", 'emptied the eastern quarter of Ithrae'),
        ('disaster', 'This disaster is remembered each year by setting paper boats on the river.', 'Which disaster is commemorated every year with paper boats sent down the river?', 'paper boats'),
        ('poem', 'This poem was written by Tobin Imbry.', "Which poem is Tobin Imbry's work?", 'Tobin Imbry wrote'),
        ('poem', 'This poem tells of Orrin Kade breaking the dike to flood the enemy.', "Which poem recounts Orrin Kade breaching the dike to drown the enemy's advance?", 'breaking the dike'),
        ('poem', 'This poem has eight cantos, each set on a different channel of the river.', "Which poem's eight cantos each take place on a different river channel?", 'eight cantos'),
        ('poem', "This poem begins with the line 'The water holds every star.'", "Which poem opens with 'The water holds every star'?", 'The water holds every star'),
        ('monument', 'This monument was commissioned by Archon Ninev Sallow.', 'Which monument did Ninev Sallow order built?', 'ordered the Star Well'),
        ('monument', 'This monument is lined with more than six hundred mirrors of polished bronze.', 'Which monument is lined with over six hundred polished bronze mirrors?', 'six hundred mirrors'),
        ('monument', 'This monument stands in the courtyard of the council house in Ithrae.', "Which monument sits in the courtyard of Ithrae's council house?", 'courtyard of the council house'),
        ('monument', 'This monument also works as a telescope, showing stars in daylight from its bottom.', 'Which monument doubles as a telescope through which stars can be seen by day?', 'works as a telescope'),
        ('deity', 'This deity is the goddess of the stars.', 'Which deity rules over the stars?', 'goddess of the stars'),
        ('deity', "This deity's sacred animal is the grey heron.", 'Which deity is symbolized by a grey heron?', 'grey heron'),
        ('deity', "This deity's chief shrine is on Mount Tolva.", 'Which deity has her main shrine on Mount Tolva?', 'main shrine of Nuvel'),
        ('deity', 'This deity is honored by burning a strip of paper inscribed with a wish at every dark moon.', 'Which deity receives a burned paper wish each dark moon?', 'inscribed with a wish'),
        ('code', 'This law code has fifty-five articles.', 'Which law code contains fifty-five articles?', 'fifty-five articles'),
        ('code', 'This law code says that anyone who repairs a broken dike may take fish from it for a year.', 'Which law code allows whoever mends a breached dike to fish there for a year?', 'repairs a broken dike'),
        ('code', 'This law code is written on the floodgates of Ithrae.', "Which law code is painted on Ithrae's floodgates?", 'written on the floodgates of Ithrae'),
        ('code', 'Under this law code, thieves were punished by being made to dredge the canals.', 'Which law code sentenced thieves to clear mud from the canals?', 'dredge the canals'),
    ],
    story={
        1: """Where the Seld River fans out toward the sea, the five delta towns once argued endlessly over water and fishing rights. Ninev Sallow, a ferryman's daughter, challenged their elders to a public debate and defeated every one of them, and so the five towns were united under one archon. When the towns offered her a golden crown, she refused it and wore a crown of woven reeds instead, saying that the delta was made of reeds and water, not gold.

Ninev moved the council house to Ithrae, a city built on stilts where the Seld River splits into seven channels, famous for its paper-makers. Ithrae is guarded by floating gates that rise with the water, so no enemy boat can pass when the river is high. Generations later, the eastern quarter of the city would be emptied by the Gloam Fever, but under Ninev it was the brightest city in the delta.

To study the heavens, the archon ordered the Star Well. It is lined with more than six hundred mirrors of polished bronze and stands in the courtyard of the council house in Ithrae. Astronomers soon found that the Well also works as a telescope: from its bottom, stars can be seen even in daylight.""",
        2: """Ninev's son, Orrin Kade, commanded her soldiers. When the hill army of Kethel came down the river, Orrin met them at the Reedwall, where the Seld River enters the Amber Gulf. The battle was fought during a meteor shower that lit the whole sky. Orrin broke a dike and flooded the fields, and the enemy army stuck fast in the mud. The Ombrel won the day.

The victory at the Reedwall led directly to the Treaty of Hanu. Archon Ninev and the warlord of Kethel sealed it on a barge moored beside the island of Quirn. Under its terms, Kethel paid a yearly tribute of three hundred cedar logs. So that it could never be quietly altered, the treaty was written on a scroll of reed paper.

Orrin's good fortune did not last. In old age he quarrelled with the council, and he spent his last years in exile on Quirn, within sight of the place where the treaty had been signed.""",
        3: """The scholar Wenna Morrent founded the Reed School in Ithrae, where students copied star charts onto paper. Her most famous invention was a bronze star-map that turned to show the night sky for any date. It is said that she never once slept at night, watching the stars until dawn every night of her life.

Reading the stars, Wenna predicted the Gloam Fever two years before it happened. Few believed her. In the year 469 of the Star Reckoning, a plague spread through the delta and emptied the eastern quarter of Ithrae. Every year since, the Ombrel have remembered the plague by setting paper boats on the river.

After the plague, the towns' laws were gathered into the Reed Ledger, a law code of fifty-five articles. It is written on the floodgates of Ithrae, where every boatman can read it. One article says that anyone who repairs a broken dike may take fish from it for a year. Under the Reed Ledger, thieves were made to dredge the canals.""",
        4: """The Seld River rises on the slopes of Mount Tolva and flows slowly through the marshes before emptying into the Amber Gulf. Its name means 'the slow mirror' in Old Ombrel. Each spring the Seld turns dark green from blooming water-weed.

Mount Tolva, the only mountain for a hundred miles, has a flat top that looks like a table. It is quarried for the black clay used in Ombrel pottery. It also holds the main shrine of Nuvel, and on the night of the autumn equinox pilgrims climb Tolva carrying candles.

Nuvel is the goddess of the stars. Her sacred animal is the grey heron, and fishermen who see one take it as her blessing. At every dark moon the Ombrel honor Nuvel by burning a strip of paper inscribed with a wish.""",
        5: """The poet Tobin Imbry wrote The Hymn of the Seventh Star, which tells of Orrin Kade breaking the dike to flood the enemy. The poem has eight cantos, each set on a different channel of the river, and it opens with the line 'The water holds every star.' Tobin wrote every line to match the rhythm of a heron's wingbeats, so that boatmen could chant it as they poled. Archon Ninev paid him in jars of honey, one jar for every verse.

Tobin's end is a mystery: he vanished in the marshes while poling a boat to Quirn. Quirn is a low island in the delta whose name means 'the drifting eye.' Its beacon burns reed bundles, and its fields are the only source of saffron in the delta. It was on Quirn, too, that Orrin Kade lived out his exile, and some say Tobin was poling there to visit him.""",
    }))


def build():
    out = {
        'pack': 'fantasy-v1',
        'title': 'Calibration world',
        'about': 'Invented facts for comparing study methods without anyone knowing the answers in advance. '
                 'Every civilization fills the same 15 slots with the same kinds of facts.',
        'slots': [{'id': s, 'kind': k, 'chapter': c} for s, k, c in SLOTS],
        'chapters': [{'n': n, 'title': t, 'slots': [s for s, _, c in SLOTS if c == n]} for n, t in CHAPTER_TITLES.items()],
        'civs': [], 'answers': [], 'clues': [],
    }
    slot_chapter = {s: c for s, _, c in SLOTS}
    for civ in CIVS:
        out['civs'].append({'id': civ['id'], 'name': civ['name'], 'blurb': civ['blurb'],
                            'story': [{'n': n, 'title': CHAPTER_TITLES[n], 'text': civ['story'][n]} for n in sorted(civ['story'])]})
        for s, _, _ in SLOTS:
            name, typ, accept = civ['answers'][s]
            out['answers'].append({'id': f"{civ['id']}.{s}", 'civ': civ['id'], 'slot': s, 'name': name, 'type': typ, 'accept': accept})
        counts = {}
        for s, study, test, key in civ['clues']:
            counts[s] = counts.get(s, 0) + 1
            out['clues'].append({'id': f"{civ['id']}.{s}.{counts[s]}", 'answer': f"{civ['id']}.{s}", 'civ': civ['id'], 'slot': s,
                                 'chapter': slot_chapter[s], 'study': study, 'test': test, 'key': key})
    return out


if __name__ == '__main__':
    data = build()
    json.dump(data, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('answers', len(data['answers']), 'clues', len(data['clues']))
