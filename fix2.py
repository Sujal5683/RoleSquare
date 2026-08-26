import sys

with open(r"c:\CDS IIT JMU\src\components\views\dataset-detail-view.tsx", "r", encoding="utf-8") as f:
    text = f.read()

import re
# The block is:
#           allDatasets={[{ 
#             id: dataset.id, 
#             name: dataset.name,
#             appColumns: allFields.map((f) => ({
#               columnId: f.id,
#               name: f.name,
#               dataType: f.type,
#               required: f.required,
#             }))
#           }]}

text = re.sub(
    r'allDatasets=\{\[\{\s*id: dataset\.id,\s*name: dataset\.name,\s*appColumns: allFields\.map\(\(f\) => \(\{\s*columnId: f\.id,\s*name: f\.name,\s*dataType: f\.type,\s*required: f\.required,\s*\}\)\)\s*\}\]\}',
    r'allDatasets={[{ id: dataset.id, name: dataset.name }]}',
    text
)

with open(r"c:\CDS IIT JMU\src\components\views\dataset-detail-view.tsx", "w", encoding="utf-8") as f:
    f.write(text)
