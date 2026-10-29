// Gemensamma konstanter (egen fil för att undvika cirkulära importer)
export const WIDTH = 320;
export const HEIGHT = 240;
export const HUD_H = 15;        // höjd på HUD-fältet överst
export const PLAYER_Y = 214;    // spelarens övre kant
export const CONTEXT_MAX = 8;   // träffar i följd som fyller Kontextfönstret
export const MAX_LIVES = 5;         // tak för Extra kontext
export const DROP_CHANCE = 0.07;    // chans att en besegrad bugg släpper en power-up
// Touchlayout (måste stämma med style.css): plats som knapparna tar, för heltalsskalningen
export const PAD_SIDE_W = 190;    // bredd per sida i liggande läge
export const PAD_BOTTOM_H = 170;  // höjd under canvasen i stående läge
