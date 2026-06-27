export async function removeWhiteBackground(base64Data: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Data;
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Data);

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const width = canvas.width;
      const height = canvas.height;

      const getIndex = (x: number, y: number) => (y * width + x) * 4;
      const isWhite = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const i = getIndex(x, y);
        return data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230 && data[i + 3] > 0;
      };

      const stack: [number, number][] = [[0, 0]];
      if (!isWhite(0, 0)) {
        let found = false;
        for (let i = 0; i < width; i += 1) {
          if (isWhite(i, 0)) {
            stack.push([i, 0]);
            found = true;
            break;
          }
          if (isWhite(i, height - 1)) {
            stack.push([i, height - 1]);
            found = true;
            break;
          }
        }
        if (!found) {
          for (let j = 0; j < height; j += 1) {
            if (isWhite(0, j)) {
              stack.push([0, j]);
              found = true;
              break;
            }
            if (isWhite(width - 1, j)) {
              stack.push([width - 1, j]);
              found = true;
              break;
            }
          }
        }
      }

      const visited = new Uint8Array(width * height);

      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        const idx = y * width + x;
        if (visited[idx]) continue;
        visited[idx] = 1;

        if (isWhite(x, y)) {
          const i = getIndex(x, y);
          data[i + 3] = 0;
          if (x > 0) stack.push([x - 1, y]);
          if (x < width - 1) stack.push([x + 1, y]);
          if (y > 0) stack.push([x, y - 1]);
          if (y < height - 1) stack.push([x, y + 1]);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64Data);
  });
}
