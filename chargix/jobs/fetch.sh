# seq 2: Poly Haven CC0 catalogue (models, textures, hdris) with categories and dimensions
O=$(realpath $1); cd /tmp
for t in models textures hdris; do curl -sfL "https://api.polyhaven.com/assets?t=$t" -o $O/ph-$t.json; ls -la $O/ph-$t.json; done
curl -sfL "https://api.polyhaven.com/categories/models" -o $O/ph-model-cats.json
