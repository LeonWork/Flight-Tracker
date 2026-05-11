import os

with open("app.js", "r") as f:
    lines = f.readlines()

map_lines = []
flights_lines = []
packages_lines = []

# map.js: lines 0 to 123
# flights.js: lines 123 to 755
# map.js (3d): lines 755 to 1013
# packages.js: 1013 to end

for i, line in enumerate(lines):
    if i < 123:
        map_lines.append(line)
    elif i < 755:
        flights_lines.append(line)
    elif i < 1013:
        map_lines.append(line)
    else:
        packages_lines.append(line)

with open("map.js", "w") as f:
    f.writelines(map_lines)

with open("flights.js", "w") as f:
    f.writelines(flights_lines)

with open("packages.js", "w") as f:
    f.writelines(packages_lines)
