/* =========================================================
   LFL — obsah webu
   Tady upravuješ členy, hlášky a kontakty. Nic jiného sahat nemusíš.
   ========================================================= */

/* ---------------------------------------------------------
   ČLENOVÉ
   Každý člen = jeden objekt { ... } v seznamu.
   - name / nick / surname: zobrazí se jako  Jméno „Přezdívka“ Příjmení
            (přezdívku nebo příjmení můžeš nechat prázdné "").
   - photo: cesta k fotce, např. "img/clenove/jmeno.jpg"
            (nech prázdné "" a zobrazí se tajemná silueta).
            Ideálně na výšku (3:4). Na webu se sama převede do černobílé.
   - facts: dvojice ["popisek", "hodnota"], zobrazí se po rozkliknutí
            karty. Klidně je uprav, smaž nebo přidej další.
   - Pořadí v seznamu = pořadí na webu. Římské číslo se dopočítá samo.
   --------------------------------------------------------- */
window.LFL_MEMBERS = [
  {
    name: "Jméno",
    nick: "Přezdívka",
    surname: "Příjmení",
    photo: "",
    quote: "Krátký citát nebo motto.",
    bio: "Sem přijde pár vět o členovi. Kdo je, co na larpech hraje, proč u toho je.",
    facts: [
      ["Member since", "—"],
      ["Role", "—"],
      ["Oblíbený larp", "—"],
    ],
  },
  {
    name: "Jméno",
    nick: "Přezdívka",
    surname: "Příjmení",
    photo: "",
    quote: "Krátký citát nebo motto.",
    bio: "Sem přijde pár vět o členovi. Kdo je, co na larpech hraje, proč u toho je.",
    facts: [
      ["Member since", "—"],
      ["Role", "—"],
      ["Oblíbený larp", "—"],
    ],
  },
  {
    name: "Jméno",
    nick: "Přezdívka",
    surname: "Příjmení",
    photo: "",
    quote: "Krátký citát nebo motto.",
    bio: "Sem přijde pár vět o členovi. Kdo je, co na larpech hraje, proč u toho je.",
    facts: [
      ["Member since", "—"],
      ["Role", "—"],
      ["Oblíbený larp", "—"],
    ],
  },
  {
    name: "Jméno",
    nick: "Přezdívka",
    surname: "Příjmení",
    photo: "",
    quote: "Krátký citát nebo motto.",
    bio: "Sem přijde pár vět o členovi. Kdo je, co na larpech hraje, proč u toho je.",
    facts: [
      ["Member since", "—"],
      ["Role", "—"],
      ["Oblíbený larp", "—"],
    ],
  },
  {
    name: "Jméno",
    nick: "Přezdívka",
    surname: "Příjmení",
    photo: "",
    quote: "Krátký citát nebo motto.",
    bio: "Sem přijde pár vět o členovi. Kdo je, co na larpech hraje, proč u toho je.",
    facts: [
      ["Member since", "—"],
      ["Role", "—"],
      ["Oblíbený larp", "—"],
    ],
  },
  {
    name: "Jméno",
    nick: "Přezdívka",
    surname: "Příjmení",
    photo: "",
    quote: "Krátký citát nebo motto.",
    bio: "Sem přijde pár vět o členovi. Kdo je, co na larpech hraje, proč u toho je.",
    facts: [
      ["Member since", "—"],
      ["Role", "—"],
      ["Oblíbený larp", "—"],
    ],
  },
];

/* ---------------------------------------------------------
   LARP HLÁŠKY (sekce pod úvodem)
   Samy se pomalu střídají jedna po druhé.
   Slovo v *hvězdičkách* jemně září a občas problikne
   (hvězdičky klidně smaž, pak bude hláška bez zvýraznění).
   --------------------------------------------------------- */
window.LFL_SAYINGS = [
  "There's no limit to the *larp*.",
  "*Do* as little as possible while still being the best.",
];

/* ---------------------------------------------------------
   KONTAKTY (patička)
   - label: co se zobrazí vlevo
   - value: co se zobrazí vpravo (text odkazu)
   - href:  kam odkaz vede
   - copy:  true = klik zkopíruje hodnotu do schránky (hodí se pro e-mail)
   Další řádek přidáš zkopírováním jednoho { ... }.
   --------------------------------------------------------- */
window.LFL_CONTACTS = [
  { label: "GitHub", value: "@doplnit", href: "https://github.com/" },
];
