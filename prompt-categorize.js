async function generate() {

    const prefix = ""
    const session = await ai.languageModel.create({
        temperature: 0.1,
        topK: 3,
        initialPrompts: [
            { role: "system", content: "Given a product description, provide a category name " +
                "from either the provided categories or a short new one." },
            { role: "user", content: "Categories: Clothing, Food, Home, Health, Crafts, Toys\n" +
                "Product: LINDT LINDOR Peppermint Cookie Milk Chocolate Truffles, 150g Gram Bag, Limited Edition, Individually Wrapped Chocolate, Christmas Chocolate" },
            { role: "assistant", content: "Food" },
            { role: "user", content: "Categories: Clothing, Food, Home, Health, Crafts, Toys\n" +
                "Product: Pentel EnerGize Retractable Mechanical Pencil, 0.7mm Medium Point, Lead Refill Tube with 12 Refills, and Eraser Refills, PL77LEBP2, 2 Pack" },
            { role: "assistant", content: "Office Supplies" },
            { role: "user", content: "Categories: Clothing, Food, Health, Crafts, Toys\n" +
                "Product: Advanced Frobulator, FB551133, blue, 2 Pack" },
            { role: "assistant", content: "Unknown" }, 
            { role: "user", content: "Categories: Food, Home, Health, Crafts, Toys\n" +
                "Product: Webber Naturals Omega-3 900 mg Triple Strength, 120 Clear Enteric No Fishy Aftertaste Softgels, Supports Cardiovascular Health and Brain Function" },
            { role: "assistant", content: "Health" },
        ]
        //systemPrompt: "Given a product description, provide a short category name. If it's unclear use 'Unknown'.",
        });

    const products = document.getElementById('products').value.split('\n');
    const tbody = document.getElementById('productTable').getElementsByTagName('tbody')[0];
    tbody.innerHTML = ''; 
    
    let categories = new Set(["Clothing", "Food", "Home", "Health", "Crafts", "Toys", "Pets", "Electronics", "Office Supplies",
         "Books", "Tools", "Beauty", "Jewelry", "Furniture", "Appliances"]);

    for(let product of products) {
        if (product.trim() !== '') {
            const row = tbody.insertRow();
            const cell1 = row.insertCell(0);
            const cell2 = row.insertCell(1);
            cell1.textContent = product;

            // Clone an existing session for efficiency, instead of recreating one each time.
            const freshSession = await session.clone();
            let result;
            try {
                const prompt = "Categories: " + Array.from(categories).join(', ') + "\n" + "Product: " + product;  
                result = await freshSession.prompt(prompt);
                // Protect against the occasional very large response (for products names that look like questions!)
                result = result.substring(0, 50);
                if (!categories.has(result)) {
                    console.log("New category: " + result);
                    categories.add(result);
                }
            } catch (error) {
                result = 'Error: ' + error.message;
            }
            freshSession.destroy();
            cell2.textContent = result;
        }
    }
}

document.getElementById('generate').addEventListener('click', () => {generate()});

document.getElementById('downloadCsv').addEventListener('click', function() {
    const rows = document.querySelectorAll('#productTable tr');
    let csvContent = "data:text/csv;charset=utf-8,";

    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = Array.from(cols).map(col => {
            let text = col.textContent.replace(/"/g, '""'); // Escape internal quotes
            return `"${text}"`; // Wrap each value in quotes
        }).join(',');
        // # ends a dataURL now and it's unclear how to escape (URL escaping doesn't work)
        csvContent += (rowData + "\n").replace(/#/g, 'X');
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'products.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.addEventListener('DOMContentLoaded', async function() {
    const st = document.getElementById(("status"));
    if (!'ai' in window || !'languageModel' in ai) {
        st.textContent = "Unavailable";
        return;
    }

    const {available, defaultTemperature, defaultTopK, maxTopK } = await ai.languageModel.capabilities();
    st.textContent = "available=" + available;
});