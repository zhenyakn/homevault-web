#!/usr/bin/env bash
# Seed a rent search + 3 candidates (and a buy search) so the apartment-search
# pages render real rows to audit. Prints the search id + candidate ids.
# Requires the dev server running on $BASE (default http://127.0.0.1:5000).
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:5000}"

SID=$(curl -sS -X POST "$BASE/api/trpc/apartmentSearch.create?batch=1" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"name":"Tel Aviv Rental Hunt","searchType":"rent","targetBudget":650000}}}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['result']['data']['json']['id'])")

cand() { curl -sS -X POST "$BASE/api/trpc/apartmentSearch.candidates.create?batch=1" \
  -H "Content-Type: application/json" -d "$1" >/dev/null; }

cand "{\"0\":{\"json\":{\"searchId\":\"$SID\",\"title\":\"Bright 3-room near Rothschild Boulevard\",\"address\":\"12 Rothschild Blvd, Tel Aviv-Yafo\",\"price\":620000,\"deposit\":1240000,\"propertyType\":\"Apartment\",\"squareMeters\":78,\"rooms\":3,\"floor\":4,\"floors\":6,\"parkingSpots\":1,\"yearBuilt\":2015,\"hasElevator\":true,\"hasStorage\":true,\"agentName\":\"Dana Levi\",\"agentContact\":\"052-123-4567\",\"listingUrl\":\"https://example.com/1\",\"notes\":\"Recently renovated, south-facing balcony with great light all day.\"}}}"
cand "{\"0\":{\"json\":{\"searchId\":\"$SID\",\"title\":\"Cozy 2-room studio in Florentin\",\"address\":\"5 Vital St, Florentin\",\"price\":480000,\"propertyType\":\"Studio\",\"squareMeters\":42,\"rooms\":2,\"floor\":2,\"agentName\":\"Yossi Cohen\"}}}"
cand "{\"0\":{\"json\":{\"searchId\":\"$SID\",\"title\":\"Spacious penthouse with rooftop terrace overlooking the sea\",\"address\":\"88 Hayarkon St, Tel Aviv\",\"price\":890000,\"propertyType\":\"Penthouse\",\"squareMeters\":120,\"rooms\":4,\"hasElevator\":true}}}"

curl -sS -X POST "$BASE/api/trpc/apartmentSearch.create?batch=1" \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"name":"Dream Home Purchase","searchType":"buy","targetBudget":250000000}}}' >/dev/null

echo "SEARCH_ID=$SID"
curl -sS "$BASE/api/trpc/apartmentSearch.candidates.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22searchId%22%3A%22$SID%22%7D%7D%7D" \
  | python3 -c "import sys,json; [print('CANDIDATE',c['id'],c['title']) for c in json.load(sys.stdin)[0]['result']['data']['json']]"
