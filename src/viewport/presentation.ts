import { Color } from "three";
import type { TelosPresentation, Vec3 } from "@aetheris/three-telos";
import type { ThemeName } from "../app/types";
const linear = (hex:string) => new Color(hex).toArray() as unknown as Vec3;
const display = (hex:string) => new Color(hex).convertLinearToSRGB().toArray() as unknown as Vec3;
function create(theme:ThemeName): TelosPresentation {
  const mars = theme === "mars";
  return { id:theme,
    backdrop:{kind:mars?"studio":"paper",base:display(mars?"#111814":"#f5f5f2"),accent:display(mars?"#29382d":"#deded8"),intensity:.45,vignette:0.25},
    lighting:{ambient:0.18,exposure:1.04,hemisphere:0.7,
      sky:linear("#ecf0f7"),ground:linear("#353a40"),
      key:[-6,10,7],keyColor:linear("#fff6e8"),keyIntensity:2.8,
      fill:[7,3,-5],fillColor:linear("#b8c9e0"),fillIntensity:0.85,
      rim:linear("#dce5ef"),rimIntensity:0.9,selection:linear("#e6b86b")},
    grid:{minor:display(mars?"#2b342f":"#b8b8b3"),major:display(mars?"#59655a":"#94948e"),
      minorOpacity:0.06,majorOpacity:0.18,majorStep:5,targetCells:14,maxLines:48,extentScale:1.35,offset:0.001},
  };
}
export const HELIOS_PRESENTATIONS = { mars:create("mars"), sirius:create("sirius") };
