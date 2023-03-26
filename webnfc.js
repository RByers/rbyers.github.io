function log(msg) {
    const logElem = document.getElementById("log");
    logElem.innerText += msg + "\n";
}

log("WebNFC available: " + ("NDEFReader" in window));

const mimeType = "application/x-rbyerstest";

let abortController = null;

document.getElementById("abort").onclick = event => {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
};

document.getElementById('init').addEventListener("click", async () => {
    log("Initializing card");
    let start = new Date();
    try {
        const ndef = new NDEFReader();
        await ndef.write({records: [
            {recordType: "mime", mediaType: mimeType, data: "0"}
        ]});
        log("Card initialized, duration: " + (new Date() - start) + "ms");
      } catch (error) {
        log("Error: " + error);
      }
});

document.getElementById('scan').addEventListener("click", async () => {
  log("Scan started");
  try {
    let start = new Date();
    abortController = new AbortController();
    abortController.signal.onabort = event => {
        log("Abort");
    };    
    const ndef = new NDEFReader();
    await ndef.scan({ signal: abortController.signal });

    ndef.addEventListener("readingerror", () => {
      log("NFC tag read error");
    });

    ndef.addEventListener("reading", async ({ message, serialNumber }) => {
        try {
            let readTime = new Date();
            log(`Found card, ${readTime - start}ms.`);
            log(`  Serial Number: ${serialNumber}`);
            for (const record of message.records) {
                log("  Record type: " + record.recordType);
                log("    MIME type: " + record.mediaType);
                log("    Record id: " + record.id);
                log("    Encoding: " + record.encoding);
                switch (record.recordType) {
                case "text":
                    const text = new TextDecoder().decode(record.data);
                    log(`    Text: ${text} (${record.lang})`);              
                    break;
                case "url":
                    const url = new TextDecoder().decode(record.data);
                    log("    Url: " + url);
                    break;
                case "mime":
                    if (record.mediaType == mimeType) {
                        const text = new TextDecoder().decode(record.data);
                        let count = parseInt(text);
                        count++;
                        log("    Updating count to: " + count);
                        await ndef.write({ signal: abortController.signal, records: [
                            {recordType: "mime", mediaType: mimeType, data: "0"}
                        ]});
                        log(`  Update complete, duration: ${new Date() - readTime}ms`);
                    }
                    break;
                default:
                    log("    Unknown record type");
                }
            }
            if (matchedUrl) {
            }
        } catch (error) {
            log("Error: " + error);
        }
    });
  } catch (error) {
    log("Error: " + error);
  }
});