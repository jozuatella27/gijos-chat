// server.js
//
// Start met: npm start
//
// Dit script:
// - draait http://localhost:3001
// - serve't de chat UI uit /public/index.html
// - /chat stuurt bericht naar OpenAI en geeft antwoord terug
//
// Belangrijk:
// - Geen image generation meer
// - Model praat ALLEEN over GiJos (adres, producten, prijzen, ophalen)
// - Tijden zijn juist (ma–vr vaste tijd, za op afspraak)

const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const { OpenAI } = require("openai");

// ---- OpenAI client ----
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---- Winkel data van GiJos ----
const SHOP = {
  name: "GiJos",
  address: "Bromidestraat 32, Tourtonne 5, Paramaribo",
  pickupWindow:
    "ma–vr 13:00–18:00. Zaterdag op afspraak, zondag gesloten.",
  phone: "+597 840-6813",
  products: [
    {
      name: "Chupa Chups Bodymist",
      type: "bodymist",
      geuren: [
        "Cheeky Cherry",
        "Strawberry Swirl",
        "Tutti Frutty",
        "Watermelon"
      ],
      pricePiece: 200,
      priceSet4: 800,
      desc: "Zoete, fruity body mist. Blijft lang hangen maar is niet te zwaar.",
      hot: true,
      lowStockNote: "Sommige geuren bijna op."
    },
    {
      name: "Chupa Chups Lippenbalsem Set",
      type: "lippenbalsem",
      smaken: [
        "Watermeloen",
        "Appel",
        "Aardbei",
        "Citroen",
        "Perzik"
      ],
      priceSet: 250,
      desc: "Set van 5 lip balms. Maakt lippen zacht en geeft een lichte glans.",
      hot: true,
      lowStockNote: "Op voorraad."
    },
    {
      name: "Slakkengel (Snail Repair Gel)",
      type: "slakkengel",
      price: 350,
      desc: "Helpt bij acne plekjes en littekens. Maakt de huid zachter en geeft glow.",
      usage: "Dun laagje op schone huid, 1-2x per dag.",
      hot: true,
      lowStockNote: "Beperkt, gaat hard."
    },
    {
      name: "Aloe Vera Dag & Nacht Crème 110 ml",
      type: "aloe",
      price: 300,
      desc: "Hydraterende crème met aloe vera. Kalmeert droge huid, ook fijn na zon.",
      usage: "Dun laagje 's ochtends en 's avonds op schone huid.",
      hot: true,
      lowStockNote: "Op voorraad."
    }
  ]
};

// ---- helper: bouw product-catalogus tekst ----
function buildProductCatalogText() {
  return SHOP.products
    .map((p) => {
      if (p.type === "bodymist") {
        return `${p.name}
- Geuren: ${p.geuren.join(", ")}
- SRD ${p.pricePiece} per stuk
- SRD ${p.priceSet4} voor set van 4
- ${p.desc}
- ${p.lowStockNote}${p.hot ? " (populair)" : ""}`;
      }
      if (p.type === "lippenbalsem") {
        return `${p.name}
- Smaken: ${p.smaken.join(", ")}
- SRD ${p.priceSet} per set (5 stuks)
- ${p.desc}
- ${p.lowStockNote}${p.hot ? " (populair)" : ""}`;
      }
      if (p.type === "slakkengel") {
        return `${p.name}
- SRD ${p.price}
- ${p.desc}
- Gebruik: ${p.usage}
- ${p.lowStockNote}${p.hot ? " (gaat snel op)" : ""}`;
      }
      if (p.type === "aloe") {
        return `${p.name}
- SRD ${p.price}
- ${p.desc}
- Gebruik: ${p.usage}
- ${p.lowStockNote}${p.hot ? " (favoriet)" : ""}`;
      }
      return "";
    })
    .join("\n\n");
}

// ---- System prompt: hoe de AI moet praten ----
function buildSystemPrompt() {
  return `
Je bent de chat-assistent van "${SHOP.name}".

Stijl:
- vriendelijk en normaal
- klinkt menselijk, WhatsApp-gevoel
- kleine Surinaamse/Nederlandse mix is goed
- kort en duidelijk
- niet te formeel, niet te overdreven schatjes in elke zin (hou het natuurlijk)

Heel belangrijk:
- Je praat ALLEEN over ${SHOP.name}, onze producten, prijzen, afhalen, reserveren/aan de kant zetten.
- Je verzint GEEN andere producten of prijzen.
- Je geeft GEEN andere adressen of tijden.

Adres / ophalen:
${SHOP.address}

Ophalen tijden:
${SHOP.pickupWindow}

Contact / WhatsApp:
${SHOP.phone}

Regel voor ophalen:
- Doordeweeks (ma–vr): klant kan gewoon langskomen tussen 13:00–18:00.
- Zaterdag: kan ook, maar alleen op afspraak / eerst even checken.
- Zondag: niet standaard open.

Als klant vraagt "waar ben je", "waar moet ik komen", "hoe laat kan ik ophalen":
  antwoord ALTIJD met het adres en de tijden hierboven.
  Zeg duidelijk dat zaterdag op afspraak is.

Als klant vraagt naar zaterdag of morgen:
  - Als het zaterdag is of wordt → zeg dat zaterdag kan, maar alleen als we eerst afstemmen.
  - Als het een normale werkdag is → zeg gewoon 13:00–18:00.

Als klant casual praat ("hey", "alles goed"):
  - reageer sociaal terug, kort
  - vraag daarna wat ze zoeken (body mist, slakkengel, lippenbalsem, aloe crème)
  - geef NIET meteen een hele lange prijslijst tenzij ze echt vragen "wat heb je" of "wat kost het".

Als klant vraagt naar prijs, geur, of voorraad:
  - geef de echte prijs in SRD
  - zeg of het beschikbaar is (bijv. "we hebben nog een paar", "gaat snel op")

Als klant vraagt naar "watermelon mist":
  - dat is Chupa Chups Bodymist geur "Watermelon"
  - prijs SRD 200 per stuk of SRD 800 voor set van 4 geuren

Als klant zegt "kan je 2 bewaren voor mij":
  - vraag naam en vraag wanneer ze ongeveer langskomen om het op te halen
  - zeg dat we het kunnen apart zetten

Als klant vraagt naar dingen die we NIET verkopen (bv Chanel parfum):
  - zeg vriendelijk dat we dat niet hebben
  - stel dan 1 van onze echte producten voor (bijv bodymist, lippenbalsem, slakkengel, aloe crème)

Productcatalogus (dit is de echte voorraad, hou je hieraan):
${buildProductCatalogText()}

Belangrijk:
- Geef nooit info buiten GiJos.
- Zeg nooit dat je een AI bent.
- Antwoord niet met lange paragrafen, hou het kort en duidelijk.
`.trim();
}

// ---- memory per klant ----
// Slaat gesprek op zodat het model context heeft
const sessions = new Map();
// sessions[from] = { messages: [ ... ] }

function getSessionMessages(from) {
  if (!sessions.has(from)) {
    sessions.set(from, {
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "assistant",
          content:
            `Hi, welkom bij ${SHOP.name} 💕 Wat zoek je vandaag? Bodymist, slakkengel, lippenbalsem of aloe crème?`,
        },
      ],
    });
  }
  return sessions.get(from).messages;
}

// ---- Express server ----
const app = express();
app.use(cors());
app.use(express.json());

// static frontend
app.use(express.static(path.join(__dirname, "public")));

// chat endpoint
app.post("/chat", async (req, res) => {
  const from = req.body.from || "browser-user";
  const userText = (req.body.text || "").trim();

  if (!userText) {
    return res.json({
      reply:
        "Vertel even wat je zoekt: bodymist, slakkengel, lippenbalsem, aloe? Of wil je gewoon het adres?",
    });
  }

  // voeg user bericht toe aan sessie
  const msgs = getSessionMessages(from);
  msgs.push({ role: "user", content: userText });

  try {
    // vraag OpenAI om antwoord
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // jouw betaalde model
      messages: msgs,
      max_tokens: 180,
      temperature: 0.5, // niet te wild, klinkt menselijk
    });

    // pak antwoord
    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Ik ben er hoor 😊 zeg even wat je precies zoekt.";

    // sla antwoord in sessie
    msgs.push({ role: "assistant", content: reply });

    // stuur terug naar browser
    return res.json({ reply });
  } catch (err) {
    console.error("AI fout:", err);

    // veilige fallback (moet altijd kloppen)
    const fallback =
      `Je kan afhalen bij ${SHOP.address}. ` +
      `${SHOP.pickupWindow}. ` +
      `We hebben bodymist (SRD 200), lippenbalsem set (SRD 250), slakkengel (SRD 350), aloe crème (SRD 300). ` +
      `Wil je dat ik iets apart zet voor je op je naam?`;

    msgs.push({ role: "assistant", content: fallback });

    return res.json({ reply: fallback });
  }
});

// server starten
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`GiJos chatserver draait op http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in je browser`);
});
