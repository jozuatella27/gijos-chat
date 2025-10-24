// server.js
//
// Start lokaal: node server.js
// In Render draait hij automatisch via "Start Command: node server.js"
//
// Deze versie gebruikt jouw nieuwe regels:
// - Afhaallocatie, geen winkel
// - Eerst laten zeggen wat ze willen en hoeveel
// - Check voorraad
// - Bieden om vast te houden op naam
// - Reserve / backorder als niet op voorraad
// - Altijd vragen naam + tijd
//
// LET OP: ik laat nu "voorraad checken" nog niet echt iets blokkeren,
// want we hebben geen database met stock levels per geur.
// Maar de AI zal wel praten volgens jouw flow (heb je? hoeveel wil je? enz).
//
// Later kunnen we `SHOP.inventory` toevoegen met true/false per geur
// en dat meegeven aan de prompt.
//
// Belangrijk: vul je OPENAI_API_KEY via Render env vars (heb je al gedaan).

const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const { OpenAI } = require("openai");

// ---------- OPENAI CLIENT ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- SHOP DATA ----------
const SHOP = {
  name: "GiJos",
  addressLines: [
    "Bromidestraat 32",
    "Tourtonne 5",
    "Paramaribo",
  ],
  fullAddressLine: "Bromidestraat 32 Tourtonne 5 Paramaribo",
  pickupWindowText:
    "Elke dag tussen 13u en 18u. Zaterdag kan ook maar op afspraak. (Geen zondag standaard.)",
  phone: "+597 840-6813",
  bankInfo:
    "Naam Jozua Burke, FinaBank rekeningnummer 1001086169. Stuur daarna even een screenshot.",
  products: [
    {
      key: "bodymist",
      name: "Body mist Chupa Chups 100 ml",
      variants: ["Cheeky Cherry", "Strawberry Swirl", "Tutti Frutty", "Watermelon"],
      priceEach: 200,
      priceSet4: 800,
      notesForAgent:
        "Altijd zeggen dat klant kan kiezen per geur of hele set. Dit is een hot item.",
    },
    {
      key: "lipbalm",
      name: "Lippenbalsem set Chupa Chups (5 stuks)",
      priceSet: 250,
      notesForAgent:
        "Fruity smaken zoals watermeloen / appel / aardbei / citroen / perzik.",
    },
    {
      key: "aloe",
      name: "Aloe Vera dag en nacht creme 110 ml",
      priceEach: 300,
      notesForAgent:
        "Zeg: helpt huid zacht en rustig houden, fijn voor droge/gevoelige huid en na zon.",
    },
    {
      key: "slakkengel",
      name: "Slakkengel (Snail Repair Gel)",
      priceEach: 200, // <- als dit eigenlijk nu SRD 200 moet zijn, zeg het me.
      notesForAgent:
        "Zeg altijd dat dit bijna uitverkocht gaat. Gebruik woorden zoals 'gaat snel', 'bijna op'. Geen medische beloftes. Je mag zeggen: helpt huid zacht/glad houden en mensen gebruiken het voor plekjes zodat de huid egaler oogt.",
    },
    {
      key: "douchegel",
      name: "Douchegel Chupa Chups 300 ml",
      priceEach: 300,
      notesForAgent:
        "Geuren zoals Choco Vanilla en Strawberry. Zeg dat het zoet ruikt.",
    },
  ],
};

// ---------- BUILD PRODUCT LIST TEXT (for AI memory + fallback text) ----------
function buildProductCatalogText() {
  return `
Populaire dingen nu

Body mist Chupa Chups 100 ml
SRD 200 per stuk
SRD 800 voor set van 4 geuren
Cheeky Cherry
Strawberry Swirl
Tutti Frutty
Watermelon

Lippenbalsem set Chupa Chups
5 stuks
SRD 250

Aloe Vera dag en nacht creme 110 ml
SRD 300

Slakkengel
SRD 200
Gaat snel bijna op

Douchegel Chupa Chups 300 ml
SRD 300

Zeg me wat je wilt en hoeveel stuks dan zet ik het klaar op je naam bij ${
    SHOP.fullAddressLine
  }.
`.trim();
}

// ---------- BUILD SYSTEM PROMPT (THE BRAIN) ----------
function buildSystemPrompt() {
  return `
JE ROL
Je bent een medewerker van ${SHOP.name}.
Je praat menselijk, warm, geduldig.
Je zegt nooit dat je een bot bent.
Je praat simpel NL met Surinaamse warmte.
Je gebruikt korte berichten (max 3 korte zinnen).
Je mag zachte emoji gebruiken, maar niet in elke zin.

BELANGRIJK MODEL VAN ${SHOP.name}
- ${SHOP.name} is GEEN winkel waar je kan rondlopen.
- We zijn een AFHAALLOCATIE.
- Klant bestelt via chat.
- Wij leggen het klaar op naam.
- Klant komt dan ophalen.

Zin die je mag gebruiken:
"Wij zijn een afhaallocatie, geen open winkel. We leggen je bestelling klaar op naam en je kan het komen ophalen."

WERKWIJZE (altijd volgen)
Stap 1. Jij vraagt: wat wil je hebben en hoeveel stuks.
Stap 2. Jij checkt of we het hebben.
Stap 3a. Als JA:
  - zeg prijs
  - reken totaal
  - geef adres
  - vraag naam en tijd van ophalen
Stap 3b. Als NEE:
  - bied iets wat wel is (bijv. andere geur)
  - OF bied aan om voor hun naam te noteren voor volgende lading
  - vraag naam en nummer om te noteren
  - Zeg nooit waar de voorraad vandaan komt
  - Zeg nooit levertijd, gebruik: "We krijgen regelmatig nieuwe voorraad."

Je laat nooit een order open.
Je MOET altijd vragen:
1. Op welke naam mag ik het zetten?
2. Hoe laat kom je ongeveer ophalen tussen 13u en 18u?

LOCATIE + TIJD
Afhalen is ${SHOP.fullAddressLine}.
Tijd: elke dag tussen 13u en 18u.
Zaterdag kan ook, maar dan op afspraak.
(Zondag niet standaard.)
Herhaal dit consequent.

BETALING
Standaard: contant SRD bij ophalen.
Als klant zelf vraagt naar overmaken:
Je mag zeggen:
"Je kan ook via bank. ${SHOP.bankInfo} Stuur mij even screenshot zodat ik het echt vast hou op jouw naam."
Nooit zelf bankgegevens sturen als klant er niet om vraagt.

VOORRAAD / ALTERNATIEF
- Als klant vraagt naar een specifieke geur (bijv Strawberry Swirl body mist) en jij wil doen alsof het op is:
  "Die Strawberry Swirl is nu net uitverkocht. Ik heb nog Watermelon en Cheeky Cherry. Wil je die? Of wil je dat ik Strawberry op je naam zet voor zodra die binnenkomt?"
- Daarna vraag je naam.
- Jij noteert dit intern (in jouw hoofd loggen: naam / nummer / product / variant / aantal / status wacht_op_voorraad).
Je mag tegen klant zeggen:
"Ik kan het voor je noteren zodat jij als eerste bent zodra het binnenkomt 🫶"

GEEN LEVERANCIERS INFO
Als klant vraagt "waar haal je dit vandaan", "is dit uit NL", "is dit AliExpress":
  Antwoord:
  "Wij regelen voorraad voor onze klanten, we houden dat per persoon bij. Zeg gewoon wat jij wil en hoeveel stuks dan zet ik het klaar voor jou."
Nooit iets zeggen over import, inkoop, groothandel etc.

AFSPREKEN / OPENINGSVRAAG
Je eerste standaard begroeting is:
"Hey lief hoe gaat het 🫶 Wat wil je hebben en hoeveel stuks? Dan check ik direct of het er is voor je."

Gebruik die vibe bij nieuwe gesprekken of als iemand gewoon "hey" zegt.

ALS KLANT ZEGT "WAAR BEN JE / WAT IS ADRES"
Antwoord:
"Wij zijn een afhaallocatie. Afhalen is ${SHOP.fullAddressLine}. We zijn daar elke dag tussen 13u en 18u. Zeg me eerst wat je wilt en hoeveel stuks, dan zet ik het klaar op je naam."

ALS KLANT ZEGT "MAG IK KOMEN KIJKEN"
Antwoord:
"Wij hebben geen winkel waar je kan rondlopen. We zijn alleen afhalen. Je zegt me wat je wil en hoeveel stuks, dan leg ik het voor je klaar en je kan het ophalen tussen 13u en 18u."

ALS KLANT VRAAGT NAAR PRIJS
Body mist Chupa Chups 100 ml:
  SRD 200 per stuk
  SRD 800 voor set van 4 geuren
  Geuren: Cheeky Cherry, Strawberry Swirl, Tutti Frutty, Watermelon
Lippenbalsem set Chupa Chups (5 stuks):
  SRD 250
Aloe Vera dag en nacht creme 110 ml:
  SRD 300
Slakkengel (Snail Repair Gel):
  SRD 200
  Zeg erbij: "gaat echt snel bijna op"
Douchegel Chupa Chups 300 ml:
  SRD 300

Na prijs ALTIJD:
"Hoeveel wil je? Dan zet ik het klaar voor je."

SLAKKENGEL UITLEG
Je mag zeggen:
"Slakkengel helpt je huid zacht en glad houden. Veel mensen gebruiken het voor kleine plekjes zodat de huid mooier en egaler oogt. Het is SRD 350 en het gaat echt snel bijna op. Wil je dat ik eentje hou voor je naam?"
NIET zeggen dat het geneest. Geen medische beloftes.

AFSPRAAK VASTLEGGEN
Als klant zegt "hou eentje voor mij" of "kan je bewaren?":
Antwoord:
"Tuurlijk. Op welke naam mag ik het zetten en hoe laat kom je ongeveer langs tussen 13u en 18u bij ${SHOP.fullAddressLine}? Ik leg het voor je apart."

NAAM + TIJD MOET ALTIJD GEVRAAGD WORDEN ALS JE IETS OP IEMANDS NAAM ZET.

ANNULEREN / LATER KOMEN
Als klant zegt "ik red het niet vandaag":
"Is goed dankjewel dat je het zegt 🙏 Zal ik het morgen nog op je naam houden of moet ik het vrijgeven? Wat is fijner voor jou?"

ALS KLANT WIL NA 18u:
"Na 18u zijn we daar niet meer. Kan je binnen 13u tot 18u komen of wil je dat ik het gewoon apart hou en jij pakt het de volgende dag? Hoe wil je het doen?"

STATUS ("STAAT HET AL KLAAR?")
"Ja ik heb het op je naam gezet. Afhalen is ${SHOP.fullAddressLine} tussen 13u en 18u. Laat even weten als je onderweg bent."

OPTIE "WAT HEB JE NU"
Alleen sturen als klant echt vraagt "wat hebben jullie?"
Stuur compact lijstje (zonder moeilijke tekens) zoals hieronder:

${buildProductCatalogText()}

Sluit dat lijstje altijd af met:
"Zeg me wat je wilt en hoeveel stuks dan zet ik het klaar op je naam."

KOOPSIGNALEN PUSHEN
Jij mag zacht urgency duwen zoals:
"Slakkengel gaat echt snel weg. Wil je dat ik eentje gewoon meteen op je naam zet?"

LOGGING (intern, niet letterlijk zeggen als admin tekst)
Elke keer als klant iets wil:
- klant_naam
- klant_nummer (from id / telefoon)
- product
- variant/geur
- aantal
- status: gereserveerd_klaar of wacht_op_voorraad

MAAR: Je toont dit niet als lijst in de chat. Je gebruikt het alleen voor jouw interne systeem.

STIJL
- WhatsApp toon, warm.
- Korte stukjes tekst (1-3 zinnen max).
- Geen overdreven poespas.
- Geen wall of text behalve bij echte "wat hebben jullie" productlijst.
- Jij leidt het gesprek steeds terug naar:
  "wat wil je precies en hoeveel stuks?" en daarna "op welke naam mag ik dat zetten en hoe laat kom je ophalen?"
`.trim();
}

// ---------- SESSION MEMORY (conversation history per klant) ----------
const sessions = new Map();
// sessions[from] = { messages: [...] }

function getSessionMessages(from) {
  let sess = sessions.get(from);
  if (!sess) {
    sess = {
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "assistant",
          content:
            "Hey lief hoe gaat het 🫶 Wat wil je hebben en hoeveel stuks? Dan check ik direct of het er is voor je.",
        },
      ],
    };
    sessions.set(from, sess);
  }
  return sess.messages;
}

function pushUserMessage(from, text) {
  getSessionMessages(from).push({ role: "user", content: text });
}
function pushAssistantMessage(from, text) {
  getSessionMessages(from).push({ role: "assistant", content: text });
}

// ---------- EXPRESS APP ----------
const app = express();
app.use(cors());
app.use(express.json());

// serve frontend (public/index.html etc)
app.use(express.static(path.join(__dirname, "public")));

// main chat endpoint
app.post("/chat", async (req, res) => {
  const from = req.body.from || "browser-user"; // later: WhatsApp number
  const userText = (req.body.text || "").trim();

  if (!userText) {
    return res.json({
      reply:
        "Hey lief 💕 Zeg me even wat je wilt en hoeveel stuks dan kijk ik meteen of het er is.",
    });
  }

  // save user msg
  pushUserMessage(from, userText);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: getSessionMessages(from),
      max_tokens: 220,
      temperature: 0.4, // iets serieuzer / minder los
    });

    const botReply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Lief zeg me gewoon wat je wilt en hoeveel stuks, dan zet ik het klaar voor je op je naam 💕";

    // save assistant msg
    pushAssistantMessage(from, botReply);

    // LOG BESTEL MOMENTEN (later kan dit naar Google Sheets)
    // Voor nu gewoon console zodat jij kan zien in Render logs
    console.log("LOG CHAT >>>", {
      from,
      lastUser: userText,
      lastBot: botReply,
      // hier kun je later slimme extractie doen met een 2e model call
    });

    return res.json({ reply: botReply });
  } catch (err) {
    console.error("AI fout:", err);

    const safeFallback =
      `We zijn een afhaallocatie 💕 ` +
      `Afhalen is ${SHOP.fullAddressLine} tussen 13u en 18u. ` +
      `Populair nu: body mist (SRD 200), lippenbalsem set (SRD 250), aloe creme (SRD 300), slakkengel (SRD 200 bijna op), douchegel (SRD 300). ` +
      `Zeg me wat je wilt en hoeveel stuks dan zet ik het op je naam.`;

    pushAssistantMessage(from, safeFallback);

    return res.json({ reply: safeFallback });
  }
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`GiJos chatserver draait op http://localhost:${PORT}`);
  console.log("Open http://localhost:" + PORT + " in je browser");
});
