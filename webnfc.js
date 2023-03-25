function log(msg) {
    const logElem = document.getElementById("log");
    logElem.innerText += msg + "\n";
}

log("WebNFC available: " + ("NDEFReader" in window));

const myUrl = "https://rbyers.github.io/webnfc.html";

document.getElementById('init').addEventListener("click", async () => {
    log("Initializing card");
    let start = new Date();
    try {
        const ndef = new NDEFReader();
        await ndef.write({records: [
            {recordType: "url", data: myUrl},
            {recordType: "text", data: "0"}]});
        log("Card initialized, duration: " + (new Date() - start) + "ms");
      } catch (error) {
        log("Error: " + error);
      }
});

document.getElementById('scan').addEventListener("click", async () => {
  log("Scan started");
  let start = new Date();
  try {
    const ndef = new NDEFReader();
    await ndef.scan();

    ndef.addEventListener("readingerror", () => {
      log("NFC tag read error");
    });

    ndef.addEventListener("reading", async ({ message, serialNumber }) => {
        try {
            log("Found card, serial Number: " + serialNumber);
            let readTime = new Date();
            let text = "";
            let matchedUrl = false;
            for (const record of message.records) {
                log("  Record type: " + record.recordType);
                log("    MIME type: " + record.mediaType);
                log("    Record id: " + record.id);
                log("    Encoding: " + record.encoding);
                switch (record.recordType) {
                case "text":
                    text = new TextDecoder(record.encoding).decode(record.data);
                    log(`    Text: ${text} (${record.lang})`);              
                    break;
                case "url":
                    log("    IsUrl");
                    const url = new TextDecoder().decode(record.data);
                    log("    Url: " + url);
                    if (url == myUrl) matchedUrl = true;
                    break;
                }
            }
            if (matchedUrl) {
                let count = parseInt(text);
                count++;
                log("    Updating count to: " + count);
                await ndef.write({records: [
                    {recordType: "url", data: myUrl},
                    {recordType: "text", data: count.toString()}]});
                log("  Update complete, duration: " + (new Date() - start) + 
                    "ms (read: " + (readTime - start) + "ms, write: " + (new Date() - readTime) + "ms)");
            }
        } catch (error) {
            log("Error: " + error);
        }
    });
  } catch (error) {
    log("Error: " + error);
  }
});