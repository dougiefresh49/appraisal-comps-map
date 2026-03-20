
/* eslint-disable */
/**
 * Monkey-patch HTMLCanvasElement.prototype.getContext to force preserveDrawingBuffer = true.
 * This is required for tools like html-to-image / html2canvas to capture WebGL content (like Google Maps Vector view).
 * Source: https://github.com/vre2h/use-react-screenshot/issues/30#issuecomment-1196312615
 */
if (typeof window !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (function (origFn: any) {
    return function (this: any, type: string, attribs: any) {
      if (type === "webgl" || type === "webgl2") {
        attribs = attribs || {};
        attribs.preserveDrawingBuffer = true;
      }
      return origFn.call(this, type, attribs);
    };
  })(HTMLCanvasElement.prototype.getContext) as any;
}

export {}; // Ensure it's treated as a module
