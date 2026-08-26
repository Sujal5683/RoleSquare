import sys

with open(r"c:\CDS IIT JMU\src\components\views\dataset-detail-view.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

# find useEffect
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "// -- Clipboard Copy (Ctrl+C / Cmd+C)" in line:
        start_idx = i
        break

if start_idx != -1:
    for i in range(start_idx, len(lines)):
        if "}, [selectedRecords, filteredRecords, visibleFields]);" in lines[i]:
            end_idx = i
            break

if start_idx != -1 and end_idx != -1:
    # extract the block
    block = lines[start_idx:end_idx+1]
    
    # remove the block from original position
    del lines[start_idx:end_idx+1]
    
    # find where to insert it (after filteredRecords declaration)
    insert_idx = -1
    for i, line in enumerate(lines):
        if "}, [records, search, minConfidence]);" in line:
            insert_idx = i + 1
            break
            
    if insert_idx != -1:
        lines[insert_idx:insert_idx] = ["\n"] + block + ["\n"]

# now fix the appColumns in allDatasets
for i, line in enumerate(lines):
    if "appColumns: allFields.map((f) => ({" in line:
        # this is inside allDatasets
        # let's just use regex to remove it
        pass

with open(r"c:\CDS IIT JMU\src\components\views\dataset-detail-view.tsx", "w", encoding="utf-8") as f:
    f.writelines(lines)
