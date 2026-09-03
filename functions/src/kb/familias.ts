/* =============================================================================
 * GENERADO desde kb/curation/familias.json — NO EDITAR.
 *
 * La fuente de verdad es ese JSON de curación (Bloque 0 de la Fase 5). Acá viaja
 * la proyección que el motor y la visión necesitan: familias, subfamilias con su
 * modo, método por defecto y ficha cabeza, y qué fichas pertenecen a cada una.
 * Se regenera con `node kb/cobertura/generar_familias_ts.js` y el candado de
 * `copias.test.ts` compara clave por clave contra el JSON.
 * =============================================================================
 */

export type ModoDeFamilia = "identificar" | "componer";

export interface Subfamilia {
  id: string;
  nombre_es: string;
  nombre_en: string;
  modo: ModoDeFamilia;
  /** Uno de los métodos de `cooking.transforms.json`. */
  metodo_por_defecto: string;
  /** La ficha que responde cuando se nombra la subfamilia y nada más específico matchea. `null` = hueco declarado. */
  cabeza: string | null;
  fichas: string[];
}

export interface Familia {
  id: string;
  nombre_es: string;
  nombre_en: string;
  modo: ModoDeFamilia;
  cabeza: string | null;
  subfamilias: Subfamilia[];
}

/** La versión del catálogo con la que se midió la taxonomía. */
export const FAMILIAS_KB_VERSION = "3.8.0+843ecb80";

export const FAMILIAS: Familia[] = [
  {
    "id": "aceite-y-grasa",
    "nombre_es": "Aceite y grasa",
    "nombre_en": "Fats and oils",
    "modo": "identificar",
    "cabeza": "fdc-2710180",
    "subfamilias": [
      {
        "id": "aceite",
        "nombre_es": "Aceite",
        "nombre_en": "Oil",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710180",
        "fichas": [
          "fdc-171031",
          "fdc-172336",
          "fdc-171412",
          "fdc-171014",
          "fdc-167702",
          "fdc-171410",
          "fdc-171030",
          "fdc-2710186",
          "fdc-171024",
          "fdc-171411",
          "fdc-171016",
          "fdc-171430",
          "fdc-2710180"
        ]
      },
      {
        "id": "grasa-solida",
        "nombre_es": "Manteca y grasa animal",
        "nombre_en": "Lard and animal fat",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-171401",
        "fichas": [
          "fdc-173571",
          "fdc-173564",
          "fdc-172345",
          "fdc-173569",
          "fdc-171401",
          "fdc-171400"
        ]
      },
      {
        "id": "mantequilla",
        "nombre_es": "Mantequilla y margarina",
        "nombre_en": "Butter and margarine",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710154",
        "fichas": [
          "fdc-2710164",
          "fdc-2710153",
          "fdc-2710154",
          "fdc-173412",
          "fdc-173410",
          "fdc-173430",
          "fdc-2710158",
          "fdc-169894"
        ]
      }
    ]
  },
  {
    "id": "alternativa-vegetal",
    "nombre_es": "Alternativa vegetal",
    "nombre_en": "Plant-based alternatives",
    "modo": "identificar",
    "cabeza": "fdc-169083",
    "subfamilias": [
      {
        "id": "sustituto-de-carne",
        "nombre_es": "Sustituto de carne",
        "nombre_en": "Meat substitutes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707468",
        "fichas": [
          "fdc-169067",
          "fdc-174268",
          "fdc-169066",
          "fdc-169068",
          "fdc-174287",
          "fdc-2707468",
          "fdc-169886",
          "fdc-169887",
          "fdc-174269",
          "fdc-172439",
          "fdc-169893"
        ]
      },
      {
        "id": "tofu",
        "nombre_es": "Tofu y fermentado de soja",
        "nombre_en": "Tofu and soy ferments",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-169083",
        "fichas": [
          "fdc-172443",
          "fdc-172452",
          "fdc-174272",
          "fdc-169083",
          "fdc-173787",
          "fdc-172449",
          "fdc-173788",
          "fdc-172451"
        ]
      }
    ]
  },
  {
    "id": "arroz",
    "nombre_es": "Arroz",
    "nombre_en": "Rice",
    "modo": "identificar",
    "cabeza": "fdc-2708403",
    "subfamilias": [
      {
        "id": "cocido",
        "nombre_es": "Arroz cocido",
        "nombre_en": "Rice, cooked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708403",
        "fichas": [
          "fdc-2708419",
          "fdc-2708403",
          "fdc-2708405",
          "fdc-2708409",
          "fdc-2708423"
        ]
      },
      {
        "id": "con-guarnicion",
        "nombre_es": "Arroz con guarnición",
        "nombre_en": "Rice with added items",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709040",
        "fichas": [
          "fdc-2708999",
          "fdc-2709029",
          "fdc-2708996",
          "fdc-2709095",
          "fdc-2709002",
          "fdc-2709040",
          "fdc-2709037",
          "fdc-2709104"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de arroz",
        "nombre_en": "Rice dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706723",
        "fichas": [
          "receta-arancini",
          "receta-arroz-a-banda",
          "receta-arroz-al-caldero",
          "fdc-2709098",
          "fdc-2709116",
          "fdc-2708977",
          "receta-arroz-con-costra",
          "fdc-2709107",
          "fdc-2709125",
          "fdc-2709087",
          "fdc-2706723"
        ]
      }
    ]
  },
  {
    "id": "bebida-alcoholica",
    "nombre_es": "Bebida alcohólica",
    "nombre_en": "Alcoholic drinks",
    "modo": "identificar",
    "cabeza": "fdc-168746",
    "subfamilias": [
      {
        "id": "cerveza",
        "nombre_es": "Cerveza",
        "nombre_en": "Beer",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-168746",
        "fichas": [
          "fdc-168746",
          "fdc-171906",
          "fdc-168749",
          "fdc-2710622",
          "fdc-2710641"
        ]
      },
      {
        "id": "coctel",
        "nombre_es": "Cóctel",
        "nombre_en": "Cocktails",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710626",
        "fichas": [
          "fdc-2710629",
          "fdc-2710626",
          "fdc-2710630",
          "fdc-2710632",
          "fdc-2710698",
          "fdc-2710677",
          "fdc-2710639",
          "fdc-2710642",
          "fdc-2710644",
          "fdc-2710648",
          "fdc-2710695"
        ]
      },
      {
        "id": "destilado",
        "nombre_es": "Destilado y licor",
        "nombre_en": "Spirits and liqueurs",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-174815",
        "fichas": [
          "fdc-174815",
          "fdc-2710623"
        ]
      },
      {
        "id": "vino",
        "nombre_es": "Vino",
        "nombre_en": "Wine",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-173190",
        "fichas": [
          "fdc-174837",
          "fdc-173190"
        ]
      }
    ]
  },
  {
    "id": "bocadillo",
    "nombre_es": "Bocadillo y sándwich",
    "nombre_en": "Sandwiches and burgers",
    "modo": "componer",
    "cabeza": "fdc-2706880",
    "subfamilias": [
      {
        "id": "bocadillo",
        "nombre_es": "Bocadillo",
        "nombre_en": "Baguette sandwich",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "receta-bocadillo-de-calamares"
        ]
      },
      {
        "id": "desayuno",
        "nombre_es": "Sándwich de desayuno",
        "nombre_en": "Breakfast sandwich",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "fdc-2708744",
          "fdc-2707343",
          "fdc-2708597",
          "fdc-2707334",
          "fdc-2707328",
          "fdc-2707338",
          "fdc-2708602"
        ]
      },
      {
        "id": "hamburguesa",
        "nombre_es": "Hamburguesa",
        "nombre_en": "Burger",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706920",
        "fichas": [
          "fdc-2706920",
          "fdc-2706888",
          "fdc-2706890",
          "fdc-2706922",
          "fdc-2706925",
          "fdc-2706926",
          "fdc-2706894",
          "fdc-2706919",
          "fdc-2706923"
        ]
      },
      {
        "id": "perrito",
        "nombre_es": "Perrito caliente",
        "nombre_en": "Hot dog",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707058",
        "fichas": [
          "fdc-2707058",
          "fdc-2707056",
          "fdc-2707057",
          "fdc-2707059",
          "fdc-2707053"
        ]
      },
      {
        "id": "sandwich-caliente",
        "nombre_es": "Sándwich caliente",
        "nombre_en": "Hot sandwich",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705801",
        "fichas": [
          "fdc-2706962",
          "fdc-2706882",
          "fdc-2706977",
          "fdc-2707483",
          "fdc-2707000",
          "fdc-2707026",
          "fdc-2707007",
          "fdc-2705794",
          "fdc-2705801",
          "fdc-2707033",
          "fdc-2707022"
        ]
      },
      {
        "id": "sandwich-frio",
        "nombre_es": "Sándwich frío",
        "nombre_en": "Cold sandwich",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706880",
        "fichas": [
          "fdc-2706880",
          "fdc-2706952",
          "fdc-2707055",
          "fdc-2706957",
          "fdc-2706964",
          "fdc-2706966",
          "fdc-2707549",
          "fdc-2707554",
          "fdc-2709137"
        ]
      },
      {
        "id": "wrap",
        "nombre_es": "Wrap",
        "nombre_en": "Wrap",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706881",
        "fichas": [
          "fdc-2706881",
          "fdc-2706992",
          "fdc-2706970",
          "fdc-2706987"
        ]
      }
    ]
  },
  {
    "id": "bolleria",
    "nombre_es": "Bollería y repostería",
    "nombre_en": "Pastries, cakes and cookies",
    "modo": "identificar",
    "cabeza": "fdc-2707669",
    "subfamilias": [
      {
        "id": "bolleria",
        "nombre_es": "Bollería",
        "nombre_en": "Pastries and sweet rolls",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707669",
        "fichas": [
          "fdc-2708058",
          "fdc-2707682",
          "fdc-2708024",
          "fdc-2708071",
          "fdc-2708070",
          "fdc-2707678",
          "fdc-2708062",
          "receta-ensaimada",
          "fdc-2707669",
          "fdc-2707704",
          "receta-pestinos",
          "fdc-2708029",
          "fdc-2708038"
        ]
      },
      {
        "id": "galleta",
        "nombre_es": "Galleta",
        "nombre_en": "Cookies and brownies",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707899",
        "fichas": [
          "fdc-2707935",
          "fdc-2707902",
          "fdc-2707903",
          "fdc-2707906",
          "fdc-2707899",
          "fdc-2707947",
          "fdc-2707949",
          "fdc-2707963",
          "fdc-2707992",
          "fdc-2707898",
          "fdc-2707941"
        ]
      },
      {
        "id": "tarta",
        "nombre_es": "Tarta y pastel",
        "nombre_en": "Cakes and pies",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707993",
        "fichas": [
          "fdc-2708044",
          "fdc-2708045",
          "fdc-2707853",
          "receta-quesada-pasiega",
          "fdc-2707993",
          "receta-tarta-de-santiago",
          "fdc-2708002",
          "fdc-2707997",
          "fdc-2708000",
          "fdc-2707995",
          "fdc-2708015",
          "fdc-2707861",
          "fdc-2705702"
        ]
      }
    ]
  },
  {
    "id": "cafe-e-infusion",
    "nombre_es": "Café e infusión",
    "nombre_en": "Coffee and tea",
    "modo": "identificar",
    "cabeza": "fdc-2710373",
    "subfamilias": [
      {
        "id": "cafe",
        "nombre_es": "Café",
        "nombre_en": "Coffee",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710373",
        "fichas": [
          "fdc-2710373",
          "fdc-2710381",
          "fdc-2710451",
          "fdc-2710374",
          "fdc-2710377"
        ]
      },
      {
        "id": "cafe-con-leche",
        "nombre_es": "Café con leche",
        "nombre_en": "Coffee with milk",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710386",
        "fichas": [
          "fdc-2710386",
          "fdc-2710382",
          "fdc-2710410",
          "fdc-2710431"
        ]
      },
      {
        "id": "te",
        "nombre_es": "Té e infusión",
        "nombre_en": "Tea and infusions",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "fdc-2710487",
          "fdc-2710508",
          "fdc-2710509",
          "fdc-2710506",
          "fdc-2710507",
          "fdc-2710512",
          "fdc-2710514",
          "fdc-2710493"
        ]
      }
    ]
  },
  {
    "id": "casqueria",
    "nombre_es": "Casquería",
    "nombre_en": "Organ meats",
    "modo": "identificar",
    "cabeza": "fdc-2706154",
    "subfamilias": [
      {
        "id": "plato",
        "nombre_es": "Plato de casquería",
        "nombre_en": "Organ meat dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "receta-morteruelo",
          "receta-rinones-al-jerez"
        ]
      },
      {
        "id": "viscera",
        "nombre_es": "Víscera",
        "nombre_en": "Organ meat",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2706154",
        "fichas": [
          "fdc-2706156",
          "fdc-2706154",
          "fdc-2706158",
          "fdc-2706162",
          "fdc-2706157"
        ]
      }
    ]
  },
  {
    "id": "cerdo",
    "nombre_es": "Carne de cerdo",
    "nombre_en": "Pork",
    "modo": "identificar",
    "cabeza": "fdc-2705862",
    "subfamilias": [
      {
        "id": "asado",
        "nombre_es": "Cerdo asado",
        "nombre_en": "Roast pork",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705882",
        "fichas": [
          "fdc-2705882"
        ]
      },
      {
        "id": "chuleta-y-lomo",
        "nombre_es": "Chuleta y lomo",
        "nombre_en": "Pork chops and loin",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2705862",
        "fichas": [
          "fdc-2705873",
          "fdc-2705862",
          "fdc-2705866"
        ]
      },
      {
        "id": "costilla",
        "nombre_es": "Costilla de cerdo",
        "nombre_en": "Pork ribs",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705893",
        "fichas": [
          "fdc-2705893"
        ]
      },
      {
        "id": "panceta",
        "nombre_es": "Panceta y tocino",
        "nombre_en": "Bacon",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705885",
        "fichas": [
          "fdc-167812",
          "fdc-2705885",
          "fdc-2705887",
          "manual-torrezno-de-soria"
        ]
      }
    ]
  },
  {
    "id": "cereal-y-grano",
    "nombre_es": "Cereal y grano",
    "nombre_en": "Grains and flours",
    "modo": "identificar",
    "cabeza": "fdc-2708399",
    "subfamilias": [
      {
        "id": "cocido",
        "nombre_es": "Grano cocido",
        "nombre_en": "Grains, cooked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708399",
        "fichas": [
          "fdc-168897",
          "fdc-170287",
          "fdc-2708440",
          "fdc-2708361",
          "fdc-170285",
          "fdc-169700",
          "fdc-170686",
          "fdc-169701",
          "fdc-168871",
          "fdc-168917",
          "fdc-2708399"
        ]
      },
      {
        "id": "crudo",
        "nombre_es": "Grano crudo o seco",
        "nombre_en": "Grains, dry",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-170688",
        "fichas": [
          "fdc-169698",
          "fdc-169726",
          "fdc-170688",
          "fdc-168884",
          "fdc-170286",
          "fdc-169718"
        ]
      },
      {
        "id": "harina",
        "nombre_es": "Harina y almidón",
        "nombre_en": "Flour and starch",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-168894",
        "fichas": [
          "manual-farofa",
          "fdc-169714",
          "fdc-170684",
          "fdc-174288",
          "fdc-169740",
          "fdc-172023",
          "fdc-168446",
          "fdc-174275",
          "fdc-174273",
          "fdc-168894",
          "fdc-170687",
          "fdc-169717"
        ]
      }
    ]
  },
  {
    "id": "condimento",
    "nombre_es": "Condimento",
    "nombre_en": "Condiments and spices",
    "modo": "identificar",
    "cabeza": "fdc-173468",
    "subfamilias": [
      {
        "id": "encurtido-y-otro",
        "nombre_es": "Otros condimentos",
        "nombre_en": "Other condiments",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "fdc-2709309",
          "fdc-167717",
          "fdc-2709183",
          "fdc-2709180",
          "fdc-2709351"
        ]
      },
      {
        "id": "especia-y-sal",
        "nombre_es": "Especia, sal y vinagre",
        "nombre_en": "Spices, salt and vinegar",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-173468",
        "fichas": [
          "fdc-172238",
          "fdc-173468"
        ]
      }
    ]
  },
  {
    "id": "cordero-y-caza",
    "nombre_es": "Cordero, conejo y caza",
    "nombre_en": "Lamb, rabbit and game",
    "modo": "identificar",
    "cabeza": "fdc-2705905",
    "subfamilias": [
      {
        "id": "caza",
        "nombre_es": "Carne de caza",
        "nombre_en": "Game meat",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705913",
        "fichas": [
          "fdc-2705913"
        ]
      },
      {
        "id": "conejo",
        "nombre_es": "Conejo",
        "nombre_en": "Rabbit",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705912",
        "fichas": [
          "receta-conejo-al-ajillo",
          "fdc-2705912"
        ]
      },
      {
        "id": "cordero",
        "nombre_es": "Cordero y cabra",
        "nombre_en": "Lamb and goat",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2705905",
        "fichas": [
          "fdc-2705908",
          "fdc-2705905",
          "fdc-172499"
        ]
      }
    ]
  },
  {
    "id": "desayuno-de-cereal",
    "nombre_es": "Cereal de desayuno",
    "nombre_en": "Breakfast cereal",
    "modo": "identificar",
    "cabeza": "fdc-2708481",
    "subfamilias": [
      {
        "id": "barrita",
        "nombre_es": "Barrita de cereal",
        "nombre_en": "Cereal bars",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708101",
        "fichas": [
          "fdc-2708101",
          "fdc-2708102",
          "fdc-2708107",
          "fdc-2708104",
          "fdc-2708114",
          "fdc-2708118",
          "fdc-2708127"
        ]
      },
      {
        "id": "gachas",
        "nombre_es": "Gachas y avena",
        "nombre_en": "Porridge and oatmeal",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708380",
        "fichas": [
          "fdc-2708380",
          "fdc-2708397",
          "fdc-2708398",
          "receta-gachas-manchegas",
          "fdc-2708373",
          "fdc-2708363",
          "fdc-2708367",
          "fdc-2708433"
        ]
      },
      {
        "id": "listo",
        "nombre_es": "Cereal listo para comer",
        "nombre_en": "Ready-to-eat cereal",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708481",
        "fichas": [
          "fdc-2708481",
          "fdc-2708447",
          "fdc-2708448",
          "fdc-2708454",
          "fdc-2708475",
          "fdc-2708445"
        ]
      }
    ]
  },
  {
    "id": "dulce",
    "nombre_es": "Dulce y chocolate",
    "nombre_en": "Sweets and chocolate",
    "modo": "identificar",
    "cabeza": "fdc-2710327",
    "subfamilias": [
      {
        "id": "azucar",
        "nombre_es": "Azúcar y miel",
        "nombre_en": "Sugar and honey",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710257",
        "fichas": [
          "fdc-2710257",
          "fdc-2710261",
          "fdc-169640"
        ]
      },
      {
        "id": "caramelo",
        "nombre_es": "Caramelo y turrón",
        "nombre_en": "Candy and nougat",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710325",
        "fichas": [
          "fdc-2710325",
          "fdc-2710358",
          "fdc-2710350",
          "receta-turron"
        ]
      },
      {
        "id": "chocolate",
        "nombre_es": "Chocolate",
        "nombre_en": "Chocolate",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710327",
        "fichas": [
          "fdc-2710327",
          "fdc-2710329",
          "fdc-2710335",
          "fdc-167987"
        ]
      },
      {
        "id": "endulzante",
        "nombre_es": "Edulcorante",
        "nombre_en": "Sugar substitutes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710267",
        "fichas": [
          "fdc-2710267",
          "fdc-2710268"
        ]
      },
      {
        "id": "untable",
        "nombre_es": "Mermelada, sirope y dulce untable",
        "nombre_en": "Jams, syrups and spreads",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710299",
        "fichas": [
          "fdc-2710278",
          "fdc-2710295",
          "fdc-2710307",
          "fdc-173461",
          "fdc-2710299",
          "fdc-2710272"
        ]
      }
    ]
  },
  {
    "id": "embutido",
    "nombre_es": "Embutido y fiambre",
    "nombre_en": "Sausages and cured meats",
    "modo": "identificar",
    "cabeza": "fdc-2706205",
    "subfamilias": [
      {
        "id": "cocido",
        "nombre_es": "Morcilla y embutido cocido",
        "nombre_en": "Blood sausage and cooked sausage",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706173",
        "fichas": [
          "fdc-2706173",
          "fdc-2706204"
        ]
      },
      {
        "id": "curado",
        "nombre_es": "Embutido curado",
        "nombre_en": "Cured sausage",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706195",
        "fichas": [
          "fdc-2706183",
          "fdc-2706185",
          "fdc-2706195"
        ]
      },
      {
        "id": "fiambre-y-pate",
        "nombre_es": "Fiambre y paté",
        "nombre_en": "Deli meat and pâté",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706205",
        "fichas": [
          "fdc-2706205",
          "fdc-2706220"
        ]
      },
      {
        "id": "fresco",
        "nombre_es": "Salchicha y embutido fresco",
        "nombre_en": "Fresh sausage",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706190",
        "fichas": [
          "fdc-2706179",
          "fdc-2706166",
          "fdc-2706169",
          "fdc-2706190",
          "fdc-2706194"
        ]
      },
      {
        "id": "jamon",
        "nombre_es": "Jamón",
        "nombre_en": "Ham",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705878",
        "fichas": [
          "fdc-2705878",
          "fdc-2705879"
        ]
      }
    ]
  },
  {
    "id": "empanada",
    "nombre_es": "Empanada y masa rellena",
    "nombre_en": "Turnovers and filled dough",
    "modo": "identificar",
    "cabeza": "fdc-2708709",
    "subfamilias": [
      {
        "id": "empanada",
        "nombre_es": "Empanada",
        "nombre_en": "Turnover",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708709",
        "fichas": [
          "fdc-2708709",
          "fdc-2708734"
        ]
      },
      {
        "id": "masa-frita",
        "nombre_es": "Masa rellena frita",
        "nombre_en": "Fried filled dough",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2708730",
        "fichas": [
          "fdc-2708723",
          "fdc-2708730",
          "fdc-2709130"
        ]
      }
    ]
  },
  {
    "id": "ensalada",
    "nombre_es": "Ensalada",
    "nombre_en": "Salads",
    "modo": "componer",
    "cabeza": "fdc-2709816",
    "subfamilias": [
      {
        "id": "con-mayonesa",
        "nombre_es": "Ensalada con mayonesa",
        "nombre_en": "Mayonnaise-dressed salad",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709816",
        "fichas": [
          "fdc-2710056",
          "fdc-2709532",
          "fdc-2709816",
          "fdc-2709815"
        ]
      },
      {
        "id": "verde",
        "nombre_es": "Ensalada verde",
        "nombre_en": "Green salad",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": []
      },
      {
        "id": "verdura",
        "nombre_es": "Ensalada de verdura",
        "nombre_en": "Vegetable salad",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "receta-ensalada-fattoush",
          "receta-ensalada-nicoise",
          "fdc-2709830",
          "receta-pipirrana"
        ]
      }
    ]
  },
  {
    "id": "fruta",
    "nombre_es": "Fruta",
    "nombre_en": "Fruit",
    "modo": "identificar",
    "cabeza": "fdc-2709213",
    "subfamilias": [
      {
        "id": "cocida",
        "nombre_es": "Fruta cocida",
        "nombre_en": "Fruit, cooked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709220",
        "fichas": [
          "fdc-2709225",
          "fdc-2709220",
          "fdc-174686",
          "fdc-2709268"
        ]
      },
      {
        "id": "conserva",
        "nombre_es": "Fruta en conserva o congelada",
        "nombre_en": "Fruit, canned or frozen",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709289",
        "fichas": [
          "fdc-167766",
          "fdc-2709266",
          "fdc-2709289",
          "fdc-2709250",
          "fdc-2709251",
          "fdc-2709284",
          "fdc-2709272",
          "fdc-2709236",
          "fdc-2709243",
          "fdc-2709227",
          "fdc-171710",
          "fdc-2709172",
          "fdc-2709247",
          "fdc-2709256",
          "fdc-2709261",
          "fdc-2709262"
        ]
      },
      {
        "id": "fresca",
        "nombre_es": "Fruta fresca",
        "nombre_en": "Fruit, raw",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709213",
        "fichas": [
          "fdc-171705",
          "fdc-171697",
          "fdc-171711",
          "fdc-171722",
          "fdc-173944",
          "fdc-169941",
          "fdc-171719",
          "fdc-169949",
          "fdc-169928",
          "fdc-167755",
          "fdc-2709283",
          "fdc-2709213",
          "fdc-171714",
          "fdc-2709271",
          "fdc-169134",
          "fdc-173021",
          "fdc-168153",
          "fdc-168154",
          "fdc-169086",
          "fdc-168155",
          "fdc-167746",
          "fdc-169105",
          "fdc-169910",
          "fdc-2709215",
          "fdc-171689",
          "fdc-169092",
          "fdc-169911",
          "fdc-173946",
          "fdc-169097",
          "fdc-169914",
          "fdc-169926",
          "fdc-169118",
          "fdc-169124",
          "fdc-169130",
          "fdc-167758",
          "fdc-167765",
          "fdc-2709237"
        ]
      },
      {
        "id": "macedonia",
        "nombre_es": "Macedonia y fruta preparada",
        "nombre_en": "Fruit salad",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709286",
        "fichas": [
          "fdc-2709286"
        ]
      },
      {
        "id": "seca",
        "nombre_es": "Fruta seca",
        "nombre_en": "Dried fruit",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "manual-acai-en-polvo",
          "fdc-2709209",
          "fdc-2709206"
        ]
      }
    ]
  },
  {
    "id": "frutos-secos",
    "nombre_es": "Frutos secos y semillas",
    "nombre_en": "Nuts and seeds",
    "modo": "identificar",
    "cabeza": "fdc-2707484",
    "subfamilias": [
      {
        "id": "crema",
        "nombre_es": "Crema de frutos secos",
        "nombre_en": "Nut butters",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-172470",
        "fichas": [
          "fdc-172457",
          "fdc-172458",
          "fdc-172459",
          "fdc-172470",
          "fdc-2707545",
          "fdc-170160",
          "fdc-2707587"
        ]
      },
      {
        "id": "fruto-seco",
        "nombre_es": "Fruto seco",
        "nombre_en": "Nuts",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707484",
        "fichas": [
          "fdc-170567",
          "fdc-170162",
          "fdc-170581",
          "fdc-170157",
          "fdc-170565",
          "fdc-2707484",
          "fdc-2707504",
          "fdc-170161",
          "fdc-172430",
          "fdc-2707512",
          "fdc-2707574",
          "fdc-170187",
          "fdc-170593",
          "fdc-170182",
          "fdc-170590",
          "fdc-2707527",
          "fdc-170591",
          "fdc-170169"
        ]
      },
      {
        "id": "semilla",
        "nombre_es": "Semilla",
        "nombre_en": "Seeds",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707579",
        "fichas": [
          "fdc-2707579",
          "fdc-170554",
          "fdc-2707585",
          "fdc-169414",
          "fdc-169412"
        ]
      }
    ]
  },
  {
    "id": "guiso",
    "nombre_es": "Guiso y cocido",
    "nombre_en": "Stews and one-pot dishes",
    "modo": "identificar",
    "cabeza": "fdc-2706721",
    "subfamilias": [
      {
        "id": "carne",
        "nombre_es": "Guiso de carne",
        "nombre_en": "Meat stew",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706721",
        "fichas": [
          "receta-caldereta-de-cordero",
          "receta-gazpachos-manchegos",
          "fdc-2706721",
          "fdc-168043",
          "fdc-2706579",
          "fdc-2707095"
        ]
      },
      {
        "id": "chili-y-picadillo",
        "nombre_es": "Chili y picadillo",
        "nombre_en": "Chili and hash",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706373",
        "fichas": [
          "fdc-2706373",
          "fdc-2706427",
          "fdc-2706584"
        ]
      },
      {
        "id": "cocido-y-potaje",
        "nombre_es": "Cocido y potaje",
        "nombre_en": "Boiled dinner and hotpot",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "receta-cocido-montanes",
          "receta-escudella",
          "receta-pote-gallego"
        ]
      },
      {
        "id": "plato-preparado",
        "nombre_es": "Plato preparado congelado",
        "nombre_en": "Frozen meal",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707096",
        "fichas": [
          "fdc-2707096"
        ]
      }
    ]
  },
  {
    "id": "huevo",
    "nombre_es": "Huevo",
    "nombre_en": "Egg",
    "modo": "identificar",
    "cabeza": "fdc-2707153",
    "subfamilias": [
      {
        "id": "cocido",
        "nombre_es": "Huevo cocido",
        "nombre_en": "Egg, boiled",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707153",
        "fichas": [
          "fdc-2707169",
          "fdc-2707164",
          "fdc-2707153",
          "fdc-2707173"
        ]
      },
      {
        "id": "crudo",
        "nombre_es": "Huevo crudo o en polvo",
        "nombre_en": "Egg, raw or dried",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707152",
        "fichas": [
          "fdc-2707152",
          "fdc-172188",
          "fdc-173462"
        ]
      },
      {
        "id": "frito",
        "nombre_es": "Huevo frito",
        "nombre_en": "Egg, fried",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2707155",
        "fichas": [
          "fdc-2707283",
          "fdc-2707155",
          "fdc-2707162"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de huevo",
        "nombre_en": "Egg dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "manual-tortilla-de-patatas",
        "fichas": [
          "receta-huevos-rotos",
          "receta-shakshuka",
          "manual-tortilla-de-patatas"
        ]
      },
      {
        "id": "revuelto-y-tortilla",
        "nombre_es": "Huevo revuelto y tortilla",
        "nombre_en": "Scrambled egg and omelet",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707198",
        "fichas": [
          "fdc-2707198",
          "fdc-2707213",
          "fdc-2707204"
        ]
      }
    ]
  },
  {
    "id": "leche",
    "nombre_es": "Leche",
    "nombre_en": "Milk",
    "modo": "identificar",
    "cabeza": "fdc-2705384",
    "subfamilias": [
      {
        "id": "en-polvo-o-evaporada",
        "nombre_es": "Leche en polvo o evaporada",
        "nombre_en": "Milk, dried or evaporated",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705398",
        "fichas": [
          "fdc-2705397",
          "fdc-2705396",
          "fdc-2705398",
          "fdc-171283",
          "fdc-171274"
        ]
      },
      {
        "id": "liquida",
        "nombre_es": "Leche líquida",
        "nombre_en": "Milk, fluid",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705384",
        "fichas": [
          "fdc-2705394",
          "fdc-2705384",
          "fdc-2705387",
          "fdc-2705400",
          "fdc-2705388"
        ]
      },
      {
        "id": "saborizada",
        "nombre_es": "Leche saborizada",
        "nombre_en": "Flavored milk",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705466",
        "fichas": [
          "fdc-2705472",
          "fdc-2705466",
          "fdc-2705477",
          "fdc-2705479",
          "fdc-2705482",
          "fdc-2705495",
          "fdc-2705496",
          "fdc-2705499",
          "fdc-171258"
        ]
      },
      {
        "id": "vegetal",
        "nombre_es": "Bebida vegetal",
        "nombre_en": "Plant-based milk",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705403",
        "fichas": [
          "fdc-2705410",
          "fdc-2705412",
          "fdc-170172",
          "fdc-2705403"
        ]
      }
    ]
  },
  {
    "id": "legumbre",
    "nombre_es": "Legumbre",
    "nombre_en": "Legumes",
    "modo": "identificar",
    "cabeza": "fdc-2707349",
    "subfamilias": [
      {
        "id": "cocida",
        "nombre_es": "Legumbre cocida",
        "nombre_en": "Legumes, cooked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707349",
        "fichas": [
          "fdc-2707390",
          "fdc-2707347",
          "fdc-2707368",
          "fdc-2707349",
          "fdc-2707414",
          "fdc-2707367",
          "fdc-2707423"
        ]
      },
      {
        "id": "conserva",
        "nombre_es": "Legumbre en conserva",
        "nombre_en": "Legumes, canned",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707351",
        "fichas": [
          "fdc-2707350",
          "fdc-2707351",
          "fdc-172438"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de legumbre",
        "nombre_en": "Legume dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707352",
        "fichas": [
          "receta-butifarra-con-alubias",
          "fdc-2707431",
          "fdc-2707408",
          "fdc-2707407",
          "fdc-2707352",
          "fdc-2708994",
          "fdc-2707366",
          "receta-habas-a-la-catalana",
          "fdc-174289",
          "fdc-2707409"
        ]
      },
      {
        "id": "seca",
        "nombre_es": "Legumbre cruda o seca",
        "nombre_en": "Legumes, dry",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-172420",
        "fichas": [
          "fdc-172420"
        ]
      }
    ]
  },
  {
    "id": "marisco",
    "nombre_es": "Marisco",
    "nombre_en": "Shellfish",
    "modo": "identificar",
    "cabeza": "fdc-2706339",
    "subfamilias": [
      {
        "id": "crustaceo",
        "nombre_es": "Crustáceo",
        "nombre_en": "Crustaceans",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2706360",
        "fichas": [
          "fdc-2706349",
          "fdc-2706362",
          "fdc-2706360",
          "fdc-2706344",
          "fdc-172009"
        ]
      },
      {
        "id": "molusco",
        "nombre_es": "Molusco",
        "nombre_en": "Mollusks",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2706339",
        "fichas": [
          "fdc-2706337",
          "fdc-2706339",
          "fdc-174223",
          "fdc-167744",
          "fdc-2706335",
          "fdc-2706336",
          "fdc-2706350",
          "fdc-174249"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de marisco",
        "nombre_en": "Shellfish dishes",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": null,
        "fichas": [
          "fdc-2706564",
          "receta-calamares-en-su-tinta",
          "receta-caldereta-de-langosta",
          "receta-caracoles-a-la-llauna",
          "fdc-2706824",
          "fdc-2706549",
          "receta-tortilla-de-camarones",
          "fdc-2706567",
          "receta-txangurro"
        ]
      },
      {
        "id": "rebozado",
        "nombre_es": "Marisco rebozado o frito",
        "nombre_en": "Shellfish, fried",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2706334",
        "fichas": [
          "fdc-2706334",
          "fdc-2706331"
        ]
      }
    ]
  },
  {
    "id": "nata",
    "nombre_es": "Nata y crema",
    "nombre_en": "Cream",
    "modo": "identificar",
    "cabeza": "fdc-2705592",
    "subfamilias": [
      {
        "id": "agria",
        "nombre_es": "Nata agria",
        "nombre_en": "Sour cream",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-173443",
        "fichas": [
          "fdc-171257",
          "fdc-173443",
          "fdc-173444"
        ]
      },
      {
        "id": "liquida",
        "nombre_es": "Nata líquida",
        "nombre_en": "Cream, fluid",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705592",
        "fichas": [
          "fdc-2705592",
          "fdc-170857",
          "fdc-171255",
          "fdc-2705595",
          "fdc-170859"
        ]
      },
      {
        "id": "montada",
        "nombre_es": "Nata montada",
        "nombre_en": "Whipped cream",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705598",
        "fichas": [
          "fdc-2705598"
        ]
      },
      {
        "id": "sustituto",
        "nombre_es": "Sustituto de nata",
        "nombre_en": "Cream substitutes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705599",
        "fichas": [
          "fdc-170868",
          "fdc-167687",
          "fdc-2705599",
          "fdc-173782",
          "fdc-175232",
          "fdc-175231",
          "fdc-171263",
          "fdc-171261",
          "fdc-168097"
        ]
      }
    ]
  },
  {
    "id": "otras-aves",
    "nombre_es": "Pavo y otras aves",
    "nombre_en": "Turkey and other poultry",
    "modo": "identificar",
    "cabeza": "fdc-2706104",
    "subfamilias": [
      {
        "id": "otras",
        "nombre_es": "Otras aves y caza de pluma",
        "nombre_en": "Other poultry and game birds",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2706147",
        "fichas": [
          "fdc-2705928",
          "fdc-2706149",
          "fdc-2706150",
          "fdc-2706147",
          "fdc-2706148"
        ]
      },
      {
        "id": "pavo",
        "nombre_es": "Pavo",
        "nombre_en": "Turkey",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2706104",
        "fichas": [
          "fdc-2706130",
          "fdc-2706127",
          "fdc-2706131",
          "fdc-2706104",
          "fdc-2706430"
        ]
      }
    ]
  },
  {
    "id": "pan",
    "nombre_es": "Pan",
    "nombre_en": "Bread",
    "modo": "identificar",
    "cabeza": "fdc-2707591",
    "subfamilias": [
      {
        "id": "bagel-y-muffin",
        "nombre_es": "Bagel y muffin inglés",
        "nombre_en": "Bagels and English muffins",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707734",
        "fichas": [
          "fdc-2707685",
          "fdc-2707734",
          "fdc-2707699",
          "fdc-2707700"
        ]
      },
      {
        "id": "barra-o-molde",
        "nombre_es": "Pan de barra o de molde",
        "nombre_en": "Bread",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707591",
        "fichas": [
          "fdc-2707591",
          "fdc-2707644",
          "fdc-2707626",
          "fdc-2707633",
          "fdc-2707593",
          "fdc-2707790",
          "fdc-2707650"
        ]
      },
      {
        "id": "panecillo",
        "nombre_es": "Panecillo y bollo de pan",
        "nombre_en": "Rolls and buns",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707595",
        "fichas": [
          "fdc-2707689",
          "fdc-2707692",
          "fdc-2707595",
          "fdc-2707597",
          "fdc-2707596"
        ]
      },
      {
        "id": "plano-y-tortilla",
        "nombre_es": "Pan plano y tortilla de trigo o maíz",
        "nombre_en": "Flatbread and tortillas",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707822",
        "fichas": [
          "fdc-168070",
          "receta-coca",
          "fdc-2707612",
          "fdc-2707616",
          "fdc-2707714",
          "fdc-2707827",
          "fdc-2707823",
          "fdc-2707822"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato hecho con pan",
        "nombre_en": "Bread-based dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "fdc-2707652",
          "receta-migas"
        ]
      },
      {
        "id": "rapido-y-bizcocho",
        "nombre_es": "Pan rápido y bizcocho salado",
        "nombre_en": "Quick breads and biscuits",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707801",
        "fichas": [
          "fdc-2707801",
          "fdc-2707829",
          "fdc-2707848",
          "manual-pan-de-queso",
          "fdc-2707846",
          "fdc-2707821",
          "fdc-2707808",
          "fdc-2707820"
        ]
      },
      {
        "id": "tostado",
        "nombre_es": "Pan tostado",
        "nombre_en": "Toast",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2707592",
        "fichas": [
          "fdc-2707592",
          "fdc-2707594"
        ]
      }
    ]
  },
  {
    "id": "pasta",
    "nombre_es": "Pasta",
    "nombre_en": "Pasta and noodles",
    "modo": "identificar",
    "cabeza": "fdc-2708357",
    "subfamilias": [
      {
        "id": "cocida",
        "nombre_es": "Pasta cocida",
        "nombre_en": "Pasta, cooked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708357",
        "fichas": [
          "fdc-2708357"
        ]
      },
      {
        "id": "fideos-asiaticos",
        "nombre_es": "Fideos asiáticos",
        "nombre_en": "Asian noodles",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-168914",
        "fichas": [
          "fdc-168905",
          "fdc-168914",
          "fdc-169884"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de pasta",
        "nombre_en": "Pasta dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708828",
        "fichas": [
          "fdc-2708795",
          "fdc-2706722",
          "fdc-2706872",
          "receta-fideua",
          "fdc-2708755",
          "fdc-2708811",
          "fdc-2708822",
          "receta-pasta-alla-norma",
          "fdc-2708828",
          "fdc-2708862",
          "fdc-2708930",
          "fdc-2709141",
          "fdc-2708949",
          "fdc-2708762",
          "fdc-2708761",
          "fdc-2708760",
          "fdc-2708722",
          "fdc-2708721"
        ]
      },
      {
        "id": "seca",
        "nombre_es": "Pasta seca",
        "nombre_en": "Pasta, dry",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-169736",
        "fichas": [
          "fdc-169736"
        ]
      }
    ]
  },
  {
    "id": "patata",
    "nombre_es": "Patata y tubérculo",
    "nombre_en": "Potato and root vegetables",
    "modo": "identificar",
    "cabeza": "fdc-2709387",
    "subfamilias": [
      {
        "id": "cruda",
        "nombre_es": "Patata cruda",
        "nombre_en": "Potato, raw",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-170026",
        "fichas": [
          "fdc-170026"
        ]
      },
      {
        "id": "frita",
        "nombre_es": "Patata frita",
        "nombre_en": "Fried potatoes",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2709456",
        "fichas": [
          "fdc-170047",
          "fdc-2709511",
          "fdc-2709491",
          "fdc-2709477",
          "fdc-2709456",
          "fdc-2709472"
        ]
      },
      {
        "id": "guisada-o-gratinada",
        "nombre_es": "Patata guisada o gratinada",
        "nombre_en": "Potato, stewed or scalloped",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709448",
        "fichas": [
          "fdc-2709553",
          "fdc-2709448",
          "fdc-2709554",
          "fdc-2709552"
        ]
      },
      {
        "id": "hervida-o-al-horno",
        "nombre_es": "Patata hervida o al horno",
        "nombre_en": "Potato, boiled or baked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709387",
        "fichas": [
          "fdc-2709403",
          "fdc-2709409",
          "fdc-2709399",
          "fdc-2709400",
          "fdc-2709393",
          "fdc-2709394",
          "fdc-2709387"
        ]
      },
      {
        "id": "pure",
        "nombre_es": "Puré de patata",
        "nombre_en": "Mashed potato",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709492",
        "fichas": [
          "fdc-2709492",
          "fdc-2709499",
          "fdc-2709503",
          "fdc-2709507"
        ]
      },
      {
        "id": "tuberculo",
        "nombre_es": "Boniato y otros tubérculos",
        "nombre_en": "Sweet potato and other root vegetables",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709698",
        "fichas": [
          "fdc-2709698",
          "fdc-168485",
          "fdc-2709705",
          "fdc-2709701",
          "fdc-168487",
          "fdc-169308",
          "fdc-169985"
        ]
      }
    ]
  },
  {
    "id": "pescado",
    "nombre_es": "Pescado",
    "nombre_en": "Fish",
    "modo": "identificar",
    "cabeza": "fdc-2706224",
    "subfamilias": [
      {
        "id": "ahumado",
        "nombre_es": "Pescado ahumado o curado",
        "nombre_en": "Fish, smoked",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706292",
        "fichas": [
          "fdc-2706292"
        ]
      },
      {
        "id": "cocinado",
        "nombre_es": "Pescado a la plancha, al horno o al vapor",
        "nombre_en": "Fish, cooked without breading",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2706224",
        "fichas": [
          "fdc-2706232",
          "fdc-174194",
          "fdc-2706309",
          "fdc-2706310",
          "fdc-2706245",
          "fdc-2706294",
          "fdc-2706313",
          "fdc-2706224",
          "fdc-2706225",
          "fdc-2706228",
          "fdc-173704",
          "fdc-2706285",
          "fdc-2706287"
        ]
      },
      {
        "id": "conserva",
        "nombre_es": "Pescado en conserva",
        "nombre_en": "Fish, canned",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706293",
        "fichas": [
          "fdc-2706293"
        ]
      },
      {
        "id": "crudo",
        "nombre_es": "Pescado crudo",
        "nombre_en": "Fish, raw",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2706284",
        "fichas": [
          "fdc-2706284"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de pescado",
        "nombre_en": "Fish dishes",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": null,
        "fichas": [
          "receta-all-i-pebre",
          "receta-bonito-con-tomate",
          "fdc-2706463",
          "receta-cocochas-en-salsa",
          "fdc-2706551",
          "fdc-2706466",
          "fdc-2706873",
          "fdc-2706850",
          "receta-marmitako",
          "receta-merluza-a-la-gallega",
          "receta-merluza-en-salsa-verde",
          "receta-pastel-de-cabracho",
          "fdc-2706460",
          "fdc-2706459"
        ]
      },
      {
        "id": "rebozado",
        "nombre_es": "Pescado rebozado o frito",
        "nombre_en": "Fish, breaded or fried",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2706227",
        "fichas": [
          "fdc-2706240",
          "fdc-2706270",
          "fdc-2706226",
          "fdc-2706227",
          "fdc-2706302"
        ]
      }
    ]
  },
  {
    "id": "pizza",
    "nombre_es": "Pizza",
    "nombre_en": "Pizza",
    "modo": "identificar",
    "cabeza": "fdc-2708614",
    "subfamilias": [
      {
        "id": "calzone",
        "nombre_es": "Calzone",
        "nombre_en": "Calzone",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708685",
        "fichas": [
          "fdc-2708685",
          "fdc-2708684"
        ]
      },
      {
        "id": "cobertura",
        "nombre_es": "Cobertura de pizza",
        "nombre_en": "Pizza topping",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705787",
        "fichas": [
          "fdc-2705789",
          "fdc-2705787",
          "fdc-2705788"
        ]
      },
      {
        "id": "con-carne",
        "nombre_es": "Pizza con carne",
        "nombre_en": "Meat pizza",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708649",
        "fichas": [
          "fdc-2708649",
          "fdc-2708638"
        ]
      },
      {
        "id": "con-queso",
        "nombre_es": "Pizza de queso",
        "nombre_en": "Cheese pizza",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708614",
        "fichas": [
          "fdc-2708614"
        ]
      },
      {
        "id": "sin-queso",
        "nombre_es": "Pizza sin queso",
        "nombre_en": "Pizza without cheese",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708674",
        "fichas": [
          "fdc-2708674",
          "fdc-2708675"
        ]
      }
    ]
  },
  {
    "id": "plato-asiatico",
    "nombre_es": "Plato asiático",
    "nombre_en": "Asian dishes",
    "modo": "identificar",
    "cabeza": "fdc-2707193",
    "subfamilias": [
      {
        "id": "empanadilla",
        "nombre_es": "Empanadilla asiática",
        "nombre_en": "Dumplings and egg rolls",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708724",
        "fichas": [
          "fdc-2708724"
        ]
      },
      {
        "id": "salteado",
        "nombre_es": "Salteado asiático",
        "nombre_en": "Stir-fry",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707193",
        "fichas": [
          "fdc-2706387",
          "fdc-2706857",
          "fdc-2706462",
          "fdc-2706743",
          "fdc-2706738",
          "fdc-2706763",
          "fdc-2707193",
          "fdc-2707195",
          "fdc-2706795",
          "fdc-2706797"
        ]
      },
      {
        "id": "sushi",
        "nombre_es": "Sushi",
        "nombre_en": "Sushi",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708959",
        "fichas": [
          "fdc-2708962",
          "fdc-2708965",
          "fdc-2708959"
        ]
      }
    ]
  },
  {
    "id": "plato-mexicano",
    "nombre_es": "Plato mexicano",
    "nombre_en": "Mexican dishes",
    "modo": "identificar",
    "cabeza": "fdc-2708514",
    "subfamilias": [
      {
        "id": "nachos",
        "nombre_es": "Nachos",
        "nombre_en": "Nachos",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708576",
        "fichas": [
          "fdc-2708576",
          "fdc-2708580"
        ]
      },
      {
        "id": "otro",
        "nombre_es": "Otro plato mexicano",
        "nombre_en": "Other Mexican dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708603",
        "fichas": [
          "fdc-2708505",
          "fdc-2708603",
          "fdc-2708506",
          "fdc-2708585"
        ]
      },
      {
        "id": "quesadilla-y-enchilada",
        "nombre_es": "Quesadilla y enchilada",
        "nombre_en": "Quesadillas and enchiladas",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708565",
        "fichas": [
          "fdc-2708565",
          "fdc-2708590"
        ]
      },
      {
        "id": "taco-y-burrito",
        "nombre_es": "Taco y burrito",
        "nombre_en": "Tacos and burritos",
        "modo": "componer",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708514",
        "fichas": [
          "fdc-2708555",
          "fdc-2708534",
          "fdc-2708535",
          "fdc-2708554",
          "fdc-2708514",
          "fdc-2708530",
          "fdc-2708529",
          "fdc-2708533"
        ]
      },
      {
        "id": "tamal",
        "nombre_es": "Tamal",
        "nombre_en": "Tamales",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708570",
        "fichas": [
          "fdc-2708570"
        ]
      }
    ]
  },
  {
    "id": "pollo",
    "nombre_es": "Pollo",
    "nombre_en": "Chicken",
    "modo": "identificar",
    "cabeza": "fdc-2705930",
    "subfamilias": [
      {
        "id": "pechuga",
        "nombre_es": "Pechuga de pollo",
        "nombre_en": "Chicken breast",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2705954",
        "fichas": [
          "fdc-2705954",
          "fdc-2705968",
          "fdc-2705956"
        ]
      },
      {
        "id": "pieza",
        "nombre_es": "Pollo en piezas",
        "nombre_en": "Chicken, whole pieces",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705930",
        "fichas": [
          "fdc-2705945",
          "fdc-2705935",
          "fdc-2705936",
          "fdc-2705937",
          "fdc-2705930",
          "fdc-2705938",
          "fdc-2705939",
          "fdc-2705940",
          "fdc-2705947",
          "fdc-2705948"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de pollo",
        "nombre_en": "Chicken dishes",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2707105",
        "fichas": [
          "fdc-2708958",
          "receta-gallina-en-pepitoria",
          "fdc-2706678",
          "fdc-2708745",
          "fdc-2706703",
          "fdc-2707105",
          "fdc-2706445",
          "fdc-2706434",
          "fdc-2706437"
        ]
      },
      {
        "id": "rebozado",
        "nombre_es": "Pollo rebozado",
        "nombre_en": "Breaded chicken",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2706092",
        "fichas": [
          "manual-coxinha",
          "fdc-2706089",
          "fdc-2706092",
          "fdc-2706098"
        ]
      }
    ]
  },
  {
    "id": "postre",
    "nombre_es": "Postre",
    "nombre_en": "Desserts",
    "modo": "identificar",
    "cabeza": "fdc-2705629",
    "subfamilias": [
      {
        "id": "flan-y-natillas",
        "nombre_es": "Flan, natillas y mousse",
        "nombre_en": "Puddings and custards",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705679",
        "fichas": [
          "fdc-2705683",
          "fdc-2705698",
          "fdc-2705679",
          "fdc-2705681"
        ]
      },
      {
        "id": "gelatina-y-sorbete",
        "nombre_es": "Gelatina y sorbete",
        "nombre_en": "Gelatins and sorbets",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710319",
        "fichas": [
          "fdc-2710319",
          "fdc-2709314",
          "fdc-2710315"
        ]
      },
      {
        "id": "helado",
        "nombre_es": "Helado",
        "nombre_en": "Ice cream",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705629",
        "fichas": [
          "fdc-2705660",
          "fdc-2705647",
          "fdc-2705658",
          "fdc-2705629",
          "fdc-2705663",
          "fdc-2705664",
          "fdc-2705674",
          "fdc-173466",
          "fdc-2707452",
          "fdc-2705456",
          "fdc-2705451"
        ]
      },
      {
        "id": "lacteo-tradicional",
        "nombre_es": "Postre lácteo tradicional",
        "nombre_en": "Traditional milk desserts",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-168063",
        "fichas": [
          "fdc-168063",
          "receta-leche-frita",
          "receta-tocinillo-de-cielo"
        ]
      }
    ]
  },
  {
    "id": "queso",
    "nombre_es": "Queso",
    "nombre_en": "Cheese",
    "modo": "identificar",
    "cabeza": "fdc-2705704",
    "subfamilias": [
      {
        "id": "azul",
        "nombre_es": "Queso azul",
        "nombre_en": "Blue cheese",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-172175",
        "fichas": [
          "fdc-172175"
        ]
      },
      {
        "id": "curado",
        "nombre_es": "Queso curado o semicurado",
        "nombre_en": "Cheese, hard and semi-hard",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705704",
        "fichas": [
          "fdc-2705704",
          "fdc-172176",
          "fdc-173416",
          "fdc-2705713",
          "fdc-170843",
          "fdc-168098",
          "fdc-171245",
          "fdc-171241",
          "fdc-171242",
          "fdc-2705730",
          "fdc-172206",
          "fdc-171247",
          "fdc-2705728",
          "fdc-2705733",
          "fdc-171251",
          "fdc-168141"
        ]
      },
      {
        "id": "fresco",
        "nombre_es": "Queso fresco",
        "nombre_en": "Cheese, fresh",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705750",
        "fichas": [
          "fdc-2705747",
          "fdc-173420",
          "fdc-2705722",
          "fdc-2705740",
          "fdc-2705750",
          "fdc-170851",
          "fdc-171248"
        ]
      },
      {
        "id": "pasta-blanda",
        "nombre_es": "Queso de pasta blanda",
        "nombre_en": "Cheese, soft-ripened",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-172177",
        "fichas": [
          "fdc-171243",
          "fdc-172177",
          "fdc-172178"
        ]
      },
      {
        "id": "procesado",
        "nombre_es": "Queso procesado o fundido",
        "nombre_en": "Processed cheese",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705764",
        "fichas": [
          "fdc-2705781",
          "fdc-2705764",
          "fdc-2705771"
        ]
      },
      {
        "id": "untable",
        "nombre_es": "Queso untable",
        "nombre_en": "Cream cheese and spreads",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-173418",
        "fichas": [
          "fdc-171254",
          "fdc-173418",
          "fdc-2705762",
          "fdc-169081",
          "fdc-172207"
        ]
      }
    ]
  },
  {
    "id": "refresco-y-agua",
    "nombre_es": "Refresco y agua",
    "nombre_en": "Soft drinks and water",
    "modo": "identificar",
    "cabeza": "fdc-2710536",
    "subfamilias": [
      {
        "id": "agua",
        "nombre_es": "Agua",
        "nombre_en": "Water",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710707",
        "fichas": [
          "fdc-2710707"
        ]
      },
      {
        "id": "agua-saborizada",
        "nombre_es": "Agua con gas o saborizada",
        "nombre_en": "Sparkling and flavored water",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710539",
        "fichas": [
          "fdc-2710539",
          "fdc-170174",
          "fdc-2710538",
          "fdc-2710711",
          "fdc-2710712"
        ]
      },
      {
        "id": "refresco",
        "nombre_es": "Refresco",
        "nombre_en": "Soft drinks",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710536",
        "fichas": [
          "fdc-2710536",
          "fdc-2710541"
        ]
      },
      {
        "id": "refresco-light",
        "nombre_es": "Refresco light",
        "nombre_en": "Diet soft drinks",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710537",
        "fichas": [
          "fdc-2710597",
          "fdc-2710577",
          "fdc-2710537",
          "fdc-2710542"
        ]
      }
    ]
  },
  {
    "id": "salsa-y-aderezo",
    "nombre_es": "Salsa y aliño",
    "nombre_en": "Sauces and dressings",
    "modo": "identificar",
    "cabeza": "fdc-2710177",
    "subfamilias": [
      {
        "id": "aderezo",
        "nombre_es": "Aliño de ensalada",
        "nombre_en": "Salad dressing",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710195",
        "fichas": [
          "fdc-171417",
          "fdc-167684",
          "fdc-171044",
          "fdc-169055",
          "fdc-169877",
          "fdc-171045",
          "fdc-2710214",
          "fdc-171043",
          "fdc-171046",
          "fdc-167699",
          "fdc-171006",
          "fdc-167704",
          "fdc-169057",
          "fdc-2710209",
          "fdc-173590",
          "fdc-2710228",
          "fdc-2710195",
          "fdc-169056",
          "fdc-2710215",
          "fdc-2710237",
          "fdc-173592",
          "fdc-171005"
        ]
      },
      {
        "id": "asiatica",
        "nombre_es": "Salsa de soja y asiática",
        "nombre_en": "Soy and Asian sauces",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-174277",
        "fichas": [
          "fdc-2707439",
          "fdc-2707438",
          "fdc-174277",
          "fdc-172473"
        ]
      },
      {
        "id": "carne",
        "nombre_es": "Salsa de carne",
        "nombre_en": "Gravy",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707149",
        "fichas": [
          "fdc-2707149"
        ]
      },
      {
        "id": "dip",
        "nombre_es": "Dip y crema para untar",
        "nombre_en": "Dips",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705618",
        "fichas": [
          "fdc-2710049",
          "fdc-2705618",
          "fdc-2705784",
          "fdc-2705786",
          "fdc-2707401",
          "fdc-2709307"
        ]
      },
      {
        "id": "mayonesa",
        "nombre_es": "Mayonesa",
        "nombre_en": "Mayonnaise",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-171009",
        "fichas": [
          "fdc-2710196",
          "fdc-167700",
          "fdc-171009",
          "fdc-171443",
          "fdc-173594",
          "fdc-171003",
          "fdc-2710176",
          "fdc-2710173"
        ]
      },
      {
        "id": "otra",
        "nombre_es": "Otras salsas",
        "nombre_en": "Other sauces",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710177",
        "fichas": [
          "fdc-2710177",
          "manual-salsa-de-calcots",
          "fdc-172200",
          "fdc-2709736",
          "fdc-2707151",
          "fdc-2710175"
        ]
      },
      {
        "id": "tomate",
        "nombre_es": "Salsa de tomate y kétchup",
        "nombre_en": "Tomato sauce and ketchup",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-170054",
        "fichas": [
          "fdc-2709733",
          "fdc-169381",
          "fdc-168556",
          "fdc-170054",
          "fdc-2706470",
          "fdc-2706422"
        ]
      }
    ]
  },
  {
    "id": "snack-salado",
    "nombre_es": "Aperitivo salado",
    "nombre_en": "Savory snacks",
    "modo": "identificar",
    "cabeza": "fdc-2709421",
    "subfamilias": [
      {
        "id": "chips-y-nachos",
        "nombre_es": "Chips de maíz y de verdura",
        "nombre_en": "Corn and vegetable chips",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2708196",
        "fichas": [
          "fdc-2709710",
          "fdc-2707428",
          "fdc-2709447",
          "fdc-2708197",
          "fdc-2708196"
        ]
      },
      {
        "id": "cracker",
        "nombre_es": "Cracker y galleta salada",
        "nombre_en": "Crackers",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708132",
        "fichas": [
          "fdc-2708164",
          "fdc-2708140",
          "fdc-2708157",
          "fdc-2708180",
          "fdc-2708132",
          "fdc-2708184",
          "fdc-2708160",
          "fdc-2708143",
          "fdc-2707690",
          "fdc-2708166"
        ]
      },
      {
        "id": "palomitas",
        "nombre_es": "Palomitas",
        "nombre_en": "Popcorn",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708216",
        "fichas": [
          "fdc-2708216",
          "fdc-2708239",
          "fdc-2708231",
          "fdc-2708223"
        ]
      },
      {
        "id": "patatas-de-bolsa",
        "nombre_es": "Patatas de bolsa",
        "nombre_en": "Potato chips",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2709421",
        "fichas": [
          "fdc-2709421",
          "fdc-2709443",
          "fdc-2709438",
          "fdc-2709445"
        ]
      },
      {
        "id": "pretzel",
        "nombre_es": "Pretzel",
        "nombre_en": "Pretzels",
        "modo": "identificar",
        "metodo_por_defecto": "horneado_masa",
        "cabeza": "fdc-2708247",
        "fichas": [
          "fdc-2708247",
          "fdc-2708267",
          "fdc-2708277",
          "fdc-2708268",
          "fdc-2708248",
          "fdc-2708259",
          "fdc-2708264"
        ]
      }
    ]
  },
  {
    "id": "sopa",
    "nombre_es": "Sopa y caldo",
    "nombre_en": "Soups and broths",
    "modo": "identificar",
    "cabeza": "fdc-2709144",
    "subfamilias": [
      {
        "id": "asiatica",
        "nombre_es": "Sopa asiática",
        "nombre_en": "Asian soup",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709153",
        "fichas": [
          "fdc-2709153",
          "fdc-2709160"
        ]
      },
      {
        "id": "caldo",
        "nombre_es": "Caldo",
        "nombre_en": "Broth",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707132",
        "fichas": [
          "fdc-2707132"
        ]
      },
      {
        "id": "crema",
        "nombre_es": "Crema y sopa espesa",
        "nombre_en": "Cream soup",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": null,
        "fichas": [
          "fdc-2707140",
          "fdc-2707547"
        ]
      },
      {
        "id": "fria",
        "nombre_es": "Sopa fría",
        "nombre_en": "Cold soup",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710106",
        "fichas": [
          "receta-ajoblanco",
          "fdc-2710106",
          "manual-salmorejo"
        ]
      },
      {
        "id": "sopa",
        "nombre_es": "Sopa",
        "nombre_en": "Soup",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709144",
        "fichas": [
          "receta-gazpachuelo",
          "receta-porrusalda",
          "fdc-2709144",
          "fdc-2709146",
          "fdc-2710115",
          "fdc-2709145",
          "fdc-2707453",
          "fdc-2709311",
          "fdc-2710114"
        ]
      }
    ]
  },
  {
    "id": "suplemento",
    "nombre_es": "Bebida deportiva y suplemento",
    "nombre_en": "Sports and nutritional drinks",
    "modo": "identificar",
    "cabeza": "fdc-2710725",
    "subfamilias": [
      {
        "id": "deportiva",
        "nombre_es": "Bebida deportiva",
        "nombre_en": "Sports drinks",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710771",
        "fichas": [
          "fdc-2710776",
          "fdc-2710771",
          "fdc-2710774"
        ]
      },
      {
        "id": "energetica",
        "nombre_es": "Bebida energética",
        "nombre_en": "Energy drinks",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710756",
        "fichas": [
          "fdc-2710756",
          "fdc-2710768"
        ]
      },
      {
        "id": "nutricional",
        "nombre_es": "Bebida nutricional",
        "nombre_en": "Nutritional beverages",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710725",
        "fichas": [
          "fdc-2710726",
          "fdc-2710725",
          "fdc-170892"
        ]
      },
      {
        "id": "polvo",
        "nombre_es": "Polvo de proteína",
        "nombre_en": "Protein powders",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710745",
        "fichas": [
          "fdc-2710740",
          "fdc-2710745",
          "fdc-2710742"
        ]
      }
    ]
  },
  {
    "id": "tortita-y-crepe",
    "nombre_es": "Tortita y crepe",
    "nombre_en": "Pancakes, waffles and crepes",
    "modo": "identificar",
    "cabeza": "fdc-2708294",
    "subfamilias": [
      {
        "id": "crepe",
        "nombre_es": "Crepe y tostada francesa",
        "nombre_en": "Crepes and French toast",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708341",
        "fichas": [
          "fdc-2708341",
          "fdc-2708342",
          "fdc-2708347",
          "fdc-2708331"
        ]
      },
      {
        "id": "tortita",
        "nombre_es": "Tortitas y gofres",
        "nombre_en": "Pancakes and waffles",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2708294",
        "fichas": [
          "fdc-2708294",
          "fdc-2708312",
          "fdc-2708326",
          "fdc-2708325"
        ]
      }
    ]
  },
  {
    "id": "vacuno",
    "nombre_es": "Carne de vacuno",
    "nombre_en": "Beef",
    "modo": "identificar",
    "cabeza": "fdc-2705819",
    "subfamilias": [
      {
        "id": "asada-o-guisada",
        "nombre_es": "Carne asada o en salsa",
        "nombre_en": "Beef, roasted or with sauce",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-2705819",
        "fichas": [
          "fdc-2705819",
          "fdc-2706369",
          "fdc-2706473",
          "fdc-2705822"
        ]
      },
      {
        "id": "costilla-y-rabo",
        "nombre_es": "Costilla y rabo",
        "nombre_en": "Ribs and oxtail",
        "modo": "identificar",
        "metodo_por_defecto": "horneado",
        "cabeza": "fdc-169510",
        "fichas": [
          "fdc-169510",
          "fdc-2705843"
        ]
      },
      {
        "id": "filete",
        "nombre_es": "Filete y bistec",
        "nombre_en": "Beef steak",
        "modo": "identificar",
        "metodo_por_defecto": "plancha",
        "cabeza": "fdc-2705824",
        "fichas": [
          "fdc-2705824",
          "fdc-2705835",
          "fdc-2705833",
          "fdc-2705828"
        ]
      },
      {
        "id": "picada",
        "nombre_es": "Carne picada y albóndigas",
        "nombre_en": "Ground beef and meatballs",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2706467",
        "fichas": [
          "fdc-2706467",
          "fdc-2706580",
          "fdc-2705854",
          "fdc-2705820"
        ]
      },
      {
        "id": "rebozada",
        "nombre_es": "Carne empanada",
        "nombre_en": "Breaded beef",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2706417",
        "fichas": [
          "fdc-2706417"
        ]
      }
    ]
  },
  {
    "id": "verdura",
    "nombre_es": "Verdura",
    "nombre_en": "Vegetables",
    "modo": "identificar",
    "cabeza": "fdc-2709763",
    "subfamilias": [
      {
        "id": "aceituna",
        "nombre_es": "Aceituna",
        "nombre_en": "Olives",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710088",
        "fichas": [
          "fdc-2710088",
          "fdc-169094"
        ]
      },
      {
        "id": "alga",
        "nombre_es": "Alga",
        "nombre_en": "Seaweed",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-168457",
        "fichas": [
          "fdc-168457",
          "fdc-168458",
          "fdc-170496"
        ]
      },
      {
        "id": "cocida",
        "nombre_es": "Verdura cocida sin grasa",
        "nombre_en": "Vegetables, cooked without fat",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709720",
        "fichas": [
          "fdc-2709766",
          "receta-calcots",
          "fdc-169338",
          "fdc-2709852",
          "fdc-2709949",
          "fdc-2709910",
          "fdc-2709889",
          "fdc-2709720"
        ]
      },
      {
        "id": "cocida-con-grasa",
        "nombre_es": "Verdura cocida con grasa",
        "nombre_en": "Vegetables, cooked with fat",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2710016",
        "fichas": [
          "fdc-2709962",
          "fdc-2709964",
          "fdc-2709973",
          "fdc-2709965",
          "fdc-2709963",
          "fdc-2709579",
          "fdc-2709581",
          "fdc-2709580",
          "fdc-2709649",
          "fdc-2709648",
          "fdc-2709939",
          "fdc-2709602",
          "fdc-2709901",
          "fdc-2709900",
          "fdc-2709622",
          "fdc-2709621",
          "fdc-2709839",
          "fdc-2709840",
          "fdc-2709838",
          "fdc-2709609",
          "fdc-2709636",
          "fdc-2709855",
          "fdc-2709857",
          "fdc-2709856",
          "fdc-2709915",
          "fdc-2709916",
          "fdc-2709914",
          "fdc-2709561",
          "fdc-2709935",
          "fdc-2709893",
          "fdc-2709890",
          "fdc-2709595",
          "fdc-2710016",
          "fdc-2710017",
          "fdc-2709671",
          "fdc-2709672",
          "fdc-2709670"
        ]
      },
      {
        "id": "conserva",
        "nombre_es": "Verdura en conserva",
        "nombre_en": "Vegetables, canned",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-169254",
        "fichas": [
          "fdc-169212",
          "fdc-168450",
          "fdc-169254",
          "fdc-169207",
          "fdc-168559",
          "fdc-169966"
        ]
      },
      {
        "id": "cruda",
        "nombre_es": "Verdura cruda",
        "nombre_en": "Vegetables, raw",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709763",
        "fichas": [
          "fdc-169991",
          "fdc-169230",
          "fdc-169988",
          "fdc-170419",
          "fdc-169228",
          "fdc-170068",
          "fdc-170406",
          "fdc-170379",
          "fdc-2709808",
          "fdc-168448",
          "fdc-2709795",
          "fdc-170005",
          "fdc-2710252",
          "fdc-169994",
          "fdc-169242",
          "fdc-169997",
          "fdc-168421",
          "fdc-170383",
          "fdc-169986",
          "fdc-169389",
          "fdc-168424",
          "fdc-168462",
          "fdc-168389",
          "fdc-170381",
          "fdc-169385",
          "fdc-169226",
          "fdc-169256",
          "fdc-168575",
          "fdc-170375",
          "fdc-168576",
          "fdc-169231",
          "fdc-170073",
          "fdc-2709789",
          "fdc-169249",
          "fdc-169248",
          "fdc-168431",
          "fdc-168407",
          "fdc-170465",
          "fdc-168454",
          "fdc-168571",
          "fdc-169260",
          "fdc-168409",
          "fdc-170416",
          "fdc-2710253",
          "fdc-2709801",
          "fdc-2709799",
          "fdc-169246",
          "fdc-168564",
          "fdc-169974",
          "fdc-169145",
          "fdc-170390",
          "fdc-169975",
          "fdc-169977",
          "fdc-169276",
          "fdc-169387",
          "fdc-170010",
          "fdc-2709719",
          "fdc-2709763",
          "fdc-170393"
        ]
      },
      {
        "id": "encurtido",
        "nombre_es": "Encurtido y fermentado",
        "nombre_en": "Pickled and fermented vegetables",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709982",
        "fichas": [
          "fdc-2709982",
          "fdc-169279",
          "fdc-170392",
          "fdc-169378",
          "fdc-168558",
          "fdc-169766",
          "fdc-2710073",
          "fdc-168561"
        ]
      },
      {
        "id": "frita",
        "nombre_es": "Verdura frita o rebozada",
        "nombre_en": "Vegetables, fried",
        "modo": "identificar",
        "metodo_por_defecto": "frito",
        "cabeza": "fdc-2710066",
        "fichas": [
          "fdc-2710066",
          "fdc-2709565"
        ]
      },
      {
        "id": "plato",
        "nombre_es": "Plato de verdura",
        "nombre_en": "Vegetable dishes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707479",
        "fichas": [
          "receta-alcachofas-con-jamon",
          "receta-cardos-a-la-navarra",
          "fdc-2709632",
          "receta-escalivada",
          "fdc-2707479",
          "fdc-2709631",
          "fdc-2709073",
          "fdc-2710028",
          "fdc-2709629",
          "receta-tumbet"
        ]
      }
    ]
  },
  {
    "id": "yogur",
    "nombre_es": "Yogur",
    "nombre_en": "Yogurt",
    "modo": "identificar",
    "cabeza": "fdc-2705417",
    "subfamilias": [
      {
        "id": "de-fruta",
        "nombre_es": "Yogur de fruta",
        "nombre_en": "Yogurt, flavored",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705425",
        "fichas": [
          "fdc-2705425"
        ]
      },
      {
        "id": "griego",
        "nombre_es": "Yogur griego",
        "nombre_en": "Greek yogurt",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705421",
        "fichas": [
          "fdc-2705429",
          "fdc-2705421"
        ]
      },
      {
        "id": "natural",
        "nombre_es": "Yogur natural",
        "nombre_en": "Yogurt, plain",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705417",
        "fichas": [
          "fdc-2705414",
          "fdc-2705417",
          "fdc-170886",
          "fdc-171284"
        ]
      },
      {
        "id": "vegetal",
        "nombre_es": "Yogur vegetal",
        "nombre_en": "Plant-based yogurt",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2707444",
        "fichas": [
          "fdc-2707570",
          "fdc-2707444",
          "fdc-173781",
          "fdc-173780",
          "fdc-173779",
          "fdc-173778",
          "fdc-175228",
          "fdc-175229",
          "fdc-175227",
          "fdc-167722"
        ]
      }
    ]
  },
  {
    "id": "zumo-y-batido",
    "nombre_es": "Zumo y batido",
    "nombre_en": "Juices and smoothies",
    "modo": "identificar",
    "cabeza": "fdc-2709315",
    "subfamilias": [
      {
        "id": "batido",
        "nombre_es": "Batido",
        "nombre_en": "Smoothies and shakes",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2705513",
        "fichas": [
          "fdc-2710607",
          "fdc-2705513",
          "fdc-2705507",
          "fdc-2710504",
          "fdc-2710604",
          "fdc-2705657"
        ]
      },
      {
        "id": "nectar",
        "nombre_es": "Néctar y bebida de fruta",
        "nombre_en": "Fruit drinks and nectars",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709340",
        "fichas": [
          "fdc-2710568",
          "fdc-2710576",
          "fdc-2710606",
          "fdc-2709342",
          "fdc-2709340",
          "fdc-168196",
          "fdc-167785",
          "fdc-2709343",
          "fdc-169107",
          "fdc-2710611"
        ]
      },
      {
        "id": "zumo-de-fruta",
        "nombre_es": "Zumo de fruta",
        "nombre_en": "Fruit juice",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-2709315",
        "fichas": [
          "fdc-2709323",
          "fdc-168117",
          "fdc-167753",
          "fdc-2709315",
          "fdc-167787",
          "fdc-168157",
          "fdc-168156",
          "fdc-167748",
          "fdc-167747",
          "fdc-169925",
          "fdc-2709320",
          "fdc-168197",
          "fdc-169109",
          "fdc-173947",
          "fdc-2709186",
          "fdc-2709177",
          "fdc-2709325",
          "fdc-2709319"
        ]
      },
      {
        "id": "zumo-de-verdura",
        "nombre_es": "Zumo de verdura",
        "nombre_en": "Vegetable juice",
        "modo": "identificar",
        "metodo_por_defecto": "mezclado",
        "cabeza": "fdc-170063",
        "fichas": [
          "fdc-2709682",
          "fdc-170458",
          "fdc-167708",
          "fdc-170063",
          "fdc-2709810",
          "fdc-170491"
        ]
      }
    ]
  }
];

/** El id compuesto `familia/subfamilia`, que es el valor del enum de la visión. */
export function idCompuesto(familia: Familia, sub: Subfamilia): string {
  return `${familia.id}/${sub.id}`;
}

/** Los 191 valores del enum, en el orden del JSON. */
export const IDS_FAMILIA_SUBFAMILIA: string[] = FAMILIAS.flatMap((f) => f.subfamilias.map((s) => idCompuesto(f, s)));
