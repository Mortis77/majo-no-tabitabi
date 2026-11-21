#!/bin/zsh
# round-2 contact sheets (toon preview, static settle = hang-fallback.js). args: which sheets (default all)
set -e
cd "${0:A:h}/../.."
O=.tmp/costume/out
mkdir -p "$O"
model() {
  local f="char_$1.glb"
  if [[ -f "$O/$f" ]]; then print -r -- "$O/$f"; else print -r -- "assets/models/chars/$f"; fi
}
preview() {
  node tools/costume/castpv.mjs --toon --anims assets/models/chars/anim_ual.glb,assets/models/chars/anim_miko.glb "$@"
}
P4="Idle_Loop@0.3,Jog_Fwd_Loop@0.3,Driving_Loop@0.5,Spell_Simple_Shoot@0.5"
L() { for c in "$@"; do printf '%s,' "$(model "$c")"; done | sed 's/,$//'; }
want() { [ -z "$S" ] || [[ " $S " == *" $1 "* ]]; }; S="$*"
want heroine && preview --models "$(model akari_v2)" --colposes --poses $P4 --views ff,bb,tq,g --cell 250x400 --cy 0.8 --dist 4.0 --hang 0.55 --labels "idle,run,sit,cast" --out $O/r2_heroine.png
want heroback && preview --models "$(model akari_v2)" --colposes --poses "Idle_Loop@0.1,Idle_Loop@0.6,Jog_Fwd_Loop@0.1,Jog_Fwd_Loop@0.3,Jog_Fwd_Loop@0.6,Sprint_Loop@0.6" --views bb,g --cell 240x400 --cy 0.85 --dist 3.4 --hang 0.55 --labels "idle a,idle b,run 1,run 2,run 3,sprint" --out $O/r2_heroine_back.png
want actions && preview --models "$(model akari_v2)" --colposes --poses "Sprint_Loop@0.6,Jump_Loop@0.5,Roll@0.4,Swim_Fwd_Loop@0.3,Death01@0.95,Spell_Simple_Idle_Loop@0.4,Farm_PlantSeed@0.5,Hit_Knockback@0.5" --views g,lf --cell 210x360 --cy 0.75 --dist 4.4 --hang 0.55 --out $O/r2_akari_actions.png
want upA && preview --models $(L akari_v2 kuzunoha_v2 rikka_v2 kagami_v2 oboroyo_v2 granny_v2 kokonoe_v2 himawari_v2) --poses Idle_Loop@0.3 --views ff,tq --cell 220x280 --cy 1.12 --dist 1.9 --hang 0.55 --out $O/r2_up_A.png
want upB && preview --models $(L ushio_v2 shoku_v2 town_a_v2 town_b_v2 villager_a_v2 villager_b_v2 villager_c_v2 fox_a_v2 fox_b_v2 banou) --poses Idle_Loop@0.3 --views ff,tq --cell 200x280 --cy 1.12 --dist 1.9 --hang 0.55 --out $O/r2_up_B.png
want lineA && preview --models $(L akari_v2 granny_v2 himawari_v2 ushio_v2 kokonoe_v2 kuzunoha_v2 rikka_v2 naru_v2 shoku_v2 kagami_v2) --poses Idle_Loop@0.3 --views ff,bb --cell 180x360 --cy 0.85 --dist 4.4 --hang 0.55 --out $O/r2_lineup_A.png
want lineB && preview --models $(L oboroyo_v2 banou villager_a_v2 villager_b_v2 villager_c_v2 fox_a_v2 fox_b_v2 town_a_v2 town_b_v2) --poses Idle_Loop@0.3 --views ff,bb --cell 180x360 --cy 0.85 --dist 4.4 --hang 0.55 --out $O/r2_lineup_B.png
want posesA && preview --models $(L granny_v2 himawari_v2 ushio_v2 kokonoe_v2 kuzunoha_v2 rikka_v2 naru_v2 shoku_v2 kagami_v2) --poses "Jog_Fwd_Loop@0.3,Driving_Loop@0.5,Spell_Simple_Shoot@0.5" --views g --cell 170x320 --cy 0.8 --dist 4.4 --hang 0.55 --out $O/r2_poses_A.png
want posesB && preview --models $(L oboroyo_v2 banou villager_a_v2 villager_b_v2 villager_c_v2 fox_a_v2 fox_b_v2 town_a_v2 town_b_v2) --poses "Jog_Fwd_Loop@0.3,Driving_Loop@0.5,Spell_Simple_Shoot@0.5" --views g --cell 170x320 --cy 0.8 --dist 4.4 --hang 0.55 --out $O/r2_poses_B.png
echo DONE
