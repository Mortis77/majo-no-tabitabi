#!/bin/zsh
# Build selected costume recipes in up to four groups.
cd "${0:A:h}/../.." || exit 1
out=.tmp/costume/out
mkdir -p "$out" || exit 1
ids=("$@")
if (( ! ${#ids} )); then
  ids=(akari granny himawari ushio kokonoe kuzunoha rikka naru shoku kagami oboroyo banou villager_a villager_b villager_c fox_a fox_b town_a town_b)
fi

pids=()
logs=()
for ((group=0; group<4 && group<${#ids}; group++)); do
  batch=()
  for ((i=group+1; i<=${#ids}; i+=4)); do batch+=("${ids[i]}"); done
  log="$out/build_$group.log"
  node tools/costume/build.mjs "${batch[@]}" > "$log" 2>&1 &
  pids+=($!)
  logs+=("$log")
done
result=0
for pid in "${pids[@]}"; do wait "$pid" || result=1; done
grep -h -E 'garment tris|Error' "${logs[@]}" || true
exit "$result"
