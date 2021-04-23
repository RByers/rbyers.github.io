'use strict'

const video = document.querySelector('#camera-stream');
const outputCanvas = document.querySelector('#output-canvas');
const outputContext = outputCanvas.getContext('2d');

// Efficiently compute the median of a large stream of numbers
// from a limited range. For streams of even length, the lower
// value is returned (rather than the average) to ensure it's
// always an integer.
function BucketMedian() {
    this.count = 0;
    this.values = [];
    this.add = function(value) {
        if (this.values[value])
            this.values[value]++;
        else
            this.values[value]=1;
        this.count++;
    }
    this.getMedian = function() {
        let c = 0;
        for (const [i, value] of this.values.entries()) {
            if (value) {
                c += value;
                if (c >= this.count / 2)
                    return i;
            }
        }
        return 0;
    }
}
const getMedianRGB = (frame, width, height, inset) => {
    let r = new BucketMedian();
    let g = new BucketMedian();
    let b = new BucketMedian();

    for (let y = Math.round(height*inset); y < height - Math.round(height*inset); y++) {
        for (let x = Math.round(width*inset); x < width - Math.round(width*inset); x++) {
        let idx = y * width * 4 + x * 4;
        r.add(frame.data[idx]);
        g.add(frame.data[idx + 1]);
        b.add(frame.data[idx + 2]);
        }
    }

    return {
        r: r.getMedian(),
        g: g.getMedian(),
        b: b.getMedian(),
    };
};

const clamp = (val, min, max) => {
    if (val > max)
        return max;
    if (val < min)
        return min;
    return val;
}

const scale = (val, around) => {
    const scaleFactor = 5;
    return clamp((val - around) * scaleFactor + around, 0, 255);
}

const processFrame = () => {
  const { videoWidth: width, videoHeight: height } = video;

  if (width && height) {
    outputCanvas.width = width;
    outputCanvas.height = height;
    outputContext.drawImage(video, 0, 0, width, height);

    const windowWidthFraction = 0.5;
    const windowAspectRatio = 4;
    const measureInset = 0.1;
    const lineWidth = 3;

    outputContext.lineWidth = lineWidth;
    outputContext.strokeStyle = 'yellow';
    const windowWidth = Math.round(width * windowWidthFraction);
    const windowX = Math.round((width - windowWidth) / 2);
    const windowHeight = Math.round(windowWidth / windowAspectRatio);
    const windowY = Math.round((height - windowHeight) / 2);
    outputContext.strokeRect(
        windowX - lineWidth/2, windowY - lineWidth/2, 
        windowWidth + lineWidth, windowHeight + lineWidth);

    const windowData = outputContext.getImageData(windowX, windowY, windowWidth, windowHeight);

    const median = getMedianRGB(windowData, windowWidth, windowHeight, measureInset);

    for (let y = 0; y < windowHeight; y++) {
        for (let x = 0; x < windowWidth; x++) {
            const idx = y * windowWidth * 4 + x * 4;
            windowData.data[idx] = scale(windowData.data[idx], median.r);
            windowData.data[idx+1] = scale(windowData.data[idx+1], median.g);
            windowData.data[idx+2] = scale(windowData.data[idx+2], median.b);
        }
    }
    outputContext.putImageData(windowData, windowX, windowY);
  }

  window.requestAnimationFrame(processFrame);
};

const constraints = {
    video: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
    
navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
  video.srcObject = stream;
  video.play();
}).catch(function (err) {
  console.error(err);
});

video.addEventListener('play', function () {
  window.requestAnimationFrame(processFrame);
});

