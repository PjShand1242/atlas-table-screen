// Same avatar engine as the artifact, now a proper module (DiceBear avataaars).
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

export const SKIN_HEX = ["ffdbb4","f1c9a5","d08b5b","ae5d29","77443a","614335"];
export const HAIR_HEX = { black:"2c1b18", dark_brown:"4a312c", brown:"724133", light_brown:"a55728", blonde:"d6b370", red:"c93305", gray:"e8e1e1", white:"ecdcbf" };
export const BG_HEX = ["3e5c76","5b4e77","6e4a3f","3f6e5a","7a6431","75424e"];
export const SHIRT_HEX = ["2e6e68","b0563f","b08a3e","4a6b96","6c4e82","557047"];

const TOP = { bald:null, buzz:"theCaesar", short:"shortFlat", side_part:"theCaesarAndSidePart", curly:"shortCurly", wavy:"shortWaved", long:"straight01", bun:"bun", afro:"fro", dreads:"dreads", big_hair:"bigHair", bob:"bob" };
const FACIAL = { stubble:"beardLight", mustache:"moustacheFancy", goatee:"beardMedium", beard:"beardMajestic" };
const GLASSES = { round:"round", rect:"wayfarers" };
const BROWS = { thin:"defaultNatural", thick:"default" };
const EYES = { round:"default", narrow:"squint" };
const MOUTH = { soft:"twinkle", big:"smile" };

export function buildAvatarSVG(f = {}) {
  const top = TOP[f.hair_style] === undefined ? TOP.short : TOP[f.hair_style];
  const opts = {
    size: 128,
    backgroundColor: [BG_HEX[((f.bubble || 1) - 1) % BG_HEX.length]],
    skinColor: [SKIN_HEX[Math.max(1, Math.min(6, f.skin || 2)) - 1]],
    hairColor: [HAIR_HEX[f.hair_color] || HAIR_HEX.dark_brown],
    facialHairColor: [HAIR_HEX[f.hair_color] || HAIR_HEX.dark_brown],
    clothing: ["shirtCrewNeck"],
    clothesColor: [SHIRT_HEX[((f.shirt || 1) - 1) % SHIRT_HEX.length]],
    eyebrows: [BROWS[f.brows] || BROWS.thin],
    eyes: [EYES[f.eyes] || EYES.round],
    mouth: [MOUTH[f.smile] || MOUTH.big],
    topProbability: top ? 100 : 0,
    facialHairProbability: FACIAL[f.facial_hair] ? 100 : 0,
    accessoriesProbability: GLASSES[f.glasses] ? 100 : 0,
  };
  if (top) opts.top = [top];
  if (FACIAL[f.facial_hair]) opts.facialHair = [FACIAL[f.facial_hair]];
  if (GLASSES[f.glasses]) opts.accessories = [GLASSES[f.glasses]];
  return createAvatar(avataaars, opts).toString();
}
export const DEFAULT_FEATURES = { skin:2, hair_style:"short", hair_color:"dark_brown", facial_hair:"none", glasses:"none", brows:"thin", eyes:"round", smile:"big", bubble:1, shirt:1 };
export const featuresToUrl = f => "data:image/svg+xml;utf8," + encodeURIComponent(buildAvatarSVG(f));
