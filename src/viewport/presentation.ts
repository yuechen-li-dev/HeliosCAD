import { Color } from "three";
import type { TelosPresentation, Vec3 } from "@aetheris/three-telos";
import type { ThemeName } from "../app/types";
const linear = (hex:string) => new Color(hex).toArray() as unknown as Vec3;
const display = (hex:string) => new Color(hex).convertLinearToSRGB().toArray() as unknown as Vec3;
function create(theme:ThemeName): TelosPresentation {
  const mars = theme === "mars";
  return { id:theme,
    backdrop:{kind:theme,base:display(mars?"#180c0a":"#01040d"),accent:display(mars?"#ff8b43":"#b9ddff"),intensity:1,vignette:0.4},
    lighting:{ambient:0.04,exposure:1.06,hemisphere:0.65,
      sky:linear(mars?"#d56a38":"#a8d7ff"),ground:linear(mars?"#160704":"#020716"),
      key:[-6,10,7],keyColor:linear(mars?"#ffb15d":"#edf8ff"),keyIntensity:3.3,
      fill:[7,3,-5],fillColor:linear(mars?"#5c1b13":"#164d9b"),fillIntensity:0.65,
      rim:linear(mars?"#ff5b24":"#7ec8ff"),rimIntensity:1.5,selection:linear(mars?"#ffd08a":"#fff4b5")},
    grid:{minor:display(mars?"#743322":"#1d4c78"),major:display(mars?"#d36738":"#85bce8"),
      minorOpacity:0.06,majorOpacity:0.18,majorStep:5,targetCells:14,maxLines:48,extentScale:1.35,offset:0.001},
  };
}
export const HELIOS_PRESENTATIONS = { mars:create("mars"), sirius:create("sirius") };
