async function generate() {

    const {available, defaultTemperature, defaultTopK, maxTopK } = await ai.languageModel.capabilities();

    if (available !== "no") {
        const session = await ai.languageModel.create({
            temperature: 0.1,
            topK: 3,
            initialPrompts: [
              { role: "system", content: "Given a product description, provide a short category name." },
              { role: "user", content: "Pentel EnerGize Retractable Mechanical Pencil, 0.7mm Medium Point, Lead Refill Tube with 12 Refills, and Eraser Refills, PL77LEBP2, 2 Pack" },
              { role: "assistant", content: "Office Supplies" },
              { role: "user", content: "Advanced Frobulator, FB551133, blue, 2 Pack" },
              { role: "assistant", content: "Unknown" }, 
              { role: "user", content: "Webber Naturals Omega-3 900 mg Triple Strength, 120 Clear Enteric No Fishy Aftertaste Softgels, Supports Cardiovascular Health and Brain Function" },
              { role: "assistant", content: "Health & Wellness" },
              { role: "user", content: "LINDT LINDOR Peppermint Cookie Milk Chocolate Truffles, 150g Gram Bag, Limited Edition, Individually Wrapped Chocolate, Christmas Chocolate" },
              { role: "assistant", content: "Food & Drink" },
            ]
           //systemPrompt: "Given a product description, provide a short category name. If it's unclear use 'Unknown'.",
          });

        const products = document.getElementById('products').value.split('\n');
        const tbody = document.getElementById('productTable').getElementsByTagName('tbody')[0];
        tbody.innerHTML = ''; 
          
        for(let product of products) {
            if (product.trim() !== '') {
                const row = tbody.insertRow();
                const cell1 = row.insertCell(0);
                const cell2 = row.insertCell(1);
                cell1.textContent = product;

                // Clone an existing session for efficiency, instead of recreating one each time.
                const freshSession = await session.clone();
                const result = await freshSession.prompt(product);
                cell2.textContent = result;
            }
        }
    }
}

document.getElementById('generate').addEventListener('click', () => {generate()});