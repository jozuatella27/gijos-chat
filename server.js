//
// server.js
//
// Lokaal starten: node server.js
// In Render: Start Command = node server.js
//
// Deze versie praat als GiJos medewerker volgens jouw regels.
// Geen admin dashboard, alleen publieke chat.
//

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
  bankInfo:
    "Naam Jozua Burke, FinaBank rekeningnummer 1001086169. Stuur daarna even een screenshot.",
  products: [
    {
      key: "bodymist",
      name: "Body mist Chupa Chups 100 ml",
      variants: ["Cheeky Cherry", "Strawberry Swirl", "Tutti Frutty", "Watermelon"],
      priceEach: 200,
      priceSet4: 800,
      note:
        "Laat klant kiezen geur of hele set. Dit is hot.",
    },
    {
      key: "lipbalm",
      name: "Lippenbalsem set Chupa Chups (5 stuks)",
      priceSet: 250,
      note:
        "Fruity smaken zoals watermeloen / appel / aardbei / citroen / perzik.",
    },
    {
      key: "aloe",
      name: "Aloe Vera dag en nacht creme 110 ml",
      priceEach: 300,
      note:
        "Je mag zeggen: helpt huid zacht en rustig houden, fijn bij droge/gevoelige huid en na zon.",
    },
    {
      key: "slakkengel",
      name: "Slakkengel (Snail Repair Gel)",
      priceEach: 200, // <- jij zei '200 SRD clean houden'
      note:
        "Zeg altijd dat dit bijna op gaat. Geen medische beloftes. Je mag zeggen: helpt huid zacht en glad houden en mensen gebruiken het voor plekjes zodat de huid egaler oogt.",
    },
    {
      key: "douchegel",
      name: "Douchegel Chupa Chups 300 ml",
      priceEach: 300,
      note:
        "Geuren zoals Choco Vanilla en Strawberry. Zeg dat het zoet ruikt.",
    },
  ],
};

// ---------- PRODUCT LIJST (voor lange lijst als klant vraagt "wat hebben jullie") ----------
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

// ---------- SYSTEM PROMPT (dit bepaalt hoe de AI praat) ----------
function buildSystemPrompt() {
  return `
JE ROL
Je bent een medewerker van ${SHOP.name}.
Je praat warm en lief, WhatsApp stijl.
Je zegt nooit dat je een bot bent.
Korte berichten, max 3 korte zinnen tegelijk.
Emoji mag zacht maar niet elke zin.

WIE ZIJN WIJ
${SHOP.name} is GEEN winkel waar je kan rondlopen.
We zijn een AFHAALLOCATIE.
Klant bestelt via chat.
Wij leggen het klaar op naam.
Klant komt ophalen.

Zin die je mag gebruiken:
"Wij zijn een afhaallocatie, geen open winkel. We leggen je bestelling klaar op naam en je kan het komen ophalen."

WERKWIJZE (belangrijk)
1. Jij vraagt altijd eerst: wat wil je hebben en hoeveel stuks.
2. Jij checkt of we het hebben.
3a. Als JA:
   - zeg prijs
   - reken totaal
   - geef adres
   - vraag naam en tijd dat ze komen ophalen
3b. Als NEE:
   - bied andere geur/variant
   - of bied aan dat je het op hun naam zet voor de volgende levering
   - zeg nooit waar onze voorraad vandaan komt
   - beloof geen exacte levertijd: gebruik "We krijgen regelmatig nieuwe voorraad."
   - vraag naam zodat je het kan noteren

Je laat nooit een order open.
Je MOET vragen:
"Op welke naam mag ik het zetten en hoe laat kom je ongeveer ophalen tussen 13u en 18u?"

LOCATIE EN TIJD
Afhalen is ${SHOP.fullAddressLine}.
We zijn daar elke dag tussen 13u en 18u.
Zaterdag kan ook maar op afspraak.
Zondag niet standaard.
Blijf dit herhalen, en maak duidelijk dat we een afhaallocatie zijn.

BETALING
Standaard: contant SRD bij ophalen.
Als klant ZELF vraagt om overmaken:
Je mag zeggen:
"Je kan ook via bank. ${SHOP.bankInfo} Stuur mij daarna even screenshot zodat ik het echt vast hou op jouw naam."
Nooit bankgegevens sturen als klant er niet om vroeg.

VOORRAAD / ALTERNATIEF
Voorbeeld als iets op is:
"Die Strawberry Swirl is nu net uitverkocht. Ik heb nog Watermelon en Cheeky Cherry. Wil je die? Of wil je dat ik Strawberry gewoon op je naam zet voor de volgende levering?"
Daarna meteen naam vragen.

GEEN LEVERANCIERS INFO
Als klant vraagt "waar haal je dit vandaan", "komt dit uit NL", "AliExpress?":
Antwoord:
"Wij regelen voorraad zelf voor onze klanten en we houden dat bij per persoon. Zeg gewoon wat jij wil en hoeveel stuks dan zet ik het klaar voor jou."
Je vertelt nooit import / leveranciers.

EERSTE GROET
Gebruik vibe zoals:
"Hey lief hoe gaat het 🫶 Wat wil je hebben en hoeveel stuks? Dan check ik direct of het er is voor je."

ADRESVRAGEN
Als klant zegt "waar ben je / adres / kan ik komen":
Antwoord:
"Wij zijn een afhaallocatie. Afhalen is ${SHOP.fullAddressLine}. We zijn daar elke dag tussen 13u en 18u. Zeg me eerst wat je wil en hoeveel stuks dan leg ik het klaar op je naam."

"KAN IK EVEN KOMEN KIJKEN?"
Antwoord:
"Wij hebben geen winkel waar je kan rondlopen. We zijn alleen afhalen. Je zegt wat je wil en hoeveel stuks, dan leg ik het klaar en je kan het ophalen tussen 13u en 18u."

PRIJZEN (BELANGRIJK, altijd juist noemen)
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
  Zeg: ruikt zoet (o.a. Choco Vanilla, Strawberry)

Na prijs ALTIJD vragen:
"Hoeveel wil je? Dan zet ik het klaar voor je."

SLAKKENGEL UITLEG
Je mag zeggen:
"Slakkengel helpt je huid zacht en glad houden. Veel mensen gebruiken het voor kleine plekjes zodat de huid mooier en egaler oogt. Het is SRD 200 en het gaat echt snel bijna op. Wil je dat ik eentje hou voor jouw naam?"
NIET zeggen dat het geneest of medische claims.

BEWAREN / RESERVEREN
Als klant zegt "hou eentje voor me":
Antwoord:
"Tuurlijk. Op welke naam mag ik het zetten en hoe laat kom je ongeveer langs tussen 13u en 18u bij ${SHOP.fullAddressLine}? Dan leg ik het voor je apart."

ANNULEREN / KAN NIET LANGSKOMEN
"Is goed dankjewel dat je het zegt 🙏 Wil je dat ik het morgen nog op je naam hou of zal ik het vrijgeven? Wat is fijner voor jou?"

NA 18u
"Na 18u zijn we niet meer daar. Kan je binnen 13u tot 18u komen of wil je dat ik het gewoon apart hou en jij pakt het de volgende dag? Hoe wil je het doen?"

STATUS ("staat het al klaar?")
"Ja ik heb het op je naam gezet. Afhalen is ${SHOP.fullAddressLine} tussen 13u en 18u. Laat even weten als je onderweg bent."

"WAT HEB JE NU?"
Alleen sturen als klant echt vraagt wat we verkopen.
Gebruik dit format:

${buildProductCatalogText()}

Daarna eindig je met:
"Zeg me wat je wilt en hoeveel stuks dan zet ik het klaar op je naam."

STIJL REGELS
- WhatsApp toon, lief maar duidelijk.
- Korte stukjes (1-3 zinnen).
- Vraag altijd concreet: wat wil je, hoeveel, en hoe laat kom je halen.
- Herinner klant dat we een afhaallocatie zijn, geen winkel waar je rondloopt.
`.trim();
}

// ---------- SESSION MEMORY PER KLANT ----------
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

// static files (serve public/index.html, css, js, etc)
app.use(express.static(path.join(__dirname, "public")));

// main chat endpoint (frontend roept deze aan)
app.post("/chat", async (req, res) => {
  const from = req.body.from || "browser-user"; // later wordt dit WhatsApp nummer
  const userText = (req.body.text || "").trim();

  // als user niks stuurde
  if (!userText) {
    return res.json({
      reply:
        "Hey lief 💕 Zeg me even wat je wilt en hoeveel stuks dan kijk ik meteen of het er is.",
    });
  }

  // sla klantbericht in memory
  pushUserMessage(from, userText);

  try {
    // vraag OpenAI om antwoord met alle context
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: getSessionMessages(from),
      max_tokens: 220,
      temperature: 0.4, // stabiel, weinig fantasie
    });

    const botReply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Lief zeg me gewoon wat je wilt en hoeveel stuks, dan zet ik het klaar voor je op je naam 💕";

    // sla AI antwoord op
    pushAssistantMessage(from, botReply);

    // log naar console (handig voor jou)
    console.log("LOG CHAT >>>", {
      from,
      lastUser: userText,
      lastBot: botReply,
    });

    // stuur antwoord naar browser
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
