# seq 1: list the CC0 MakeHuman asset repos
O=$(realpath $1); cd /tmp
for r in makehuman makehuman-assets mpfb2 makehuman-system-assets; do
  git clone -q --depth 1 https://github.com/makehumancommunity/$r.git $r 2>&1 | tail -2 || true
  [ -d $r ] && (cd $r && git lfs ls-files 2>/dev/null | head -3; find . -path ./.git -prune -o -type f -printf '%s %p\n' | sort -k2 > $O/$r-files.txt; wc -l $O/$r-files.txt)
done
