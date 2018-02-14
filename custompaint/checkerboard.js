class CheckerboardPainter {
  // inputProperties returns a list of CSS properties that this paint function gets access to
  static get inputProperties() { return ['--checkerboard-spacing', '--checkerboard-size']; }

  paint(ctx, geom, properties) {
    // Paint worklet uses CSS Typed OM to model the input values.
    // As of now, they are mostly wrappers around strings,
    // but will be augmented to hold more accessible data over time.
    console.log(properties);
    console.log(properties.get('--checkerboard-size'));
    const size = parseInt(properties.get('--checkerboard-size').toString());
    const spacing = parseInt(properties.get('--checkerboard-spacing').toString());
    const colors = ['red', 'green', 'blue'];
    for(let y = 0; y < geom.height/size; y++) {
      for(let x = 0; x < geom.width/size; x++) {
        ctx.fillStyle = colors[(x + y) % colors.length];
        ctx.beginPath();
        ctx.rect(x*(size + spacing), y*(size + spacing), size, size);
        ctx.fill();
      }
    }
  }
}

registerPaint('checkerboard', CheckerboardPainter);
