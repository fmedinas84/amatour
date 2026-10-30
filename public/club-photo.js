export const MAX_CLUB_PHOTO_BYTES=45000;
export function validatePhotoFile(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Selecciona una imagen JPG, PNG o WebP.');
 if(file.size>8*1024*1024)throw Error('La foto original no debe superar 8 MB.');
}
// Re-encode to JPEG to remove metadata and keep a small persistent demo cover.
export async function compressClubPhoto(file){
 validatePhotoFile(file);
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;
  try{await image.decode();}catch{throw Error('No pudimos leer esa imagen. Prueba con otra foto.');}
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('La imagen es demasiado grande. Usa una foto de menos de 40 megapíxeles.');
  const canvas=document.createElement('canvas');const context=canvas.getContext('2d');
  for(const width of [800,640,480,320]){
   const scale=Math.min(1,width/image.naturalWidth,width/image.naturalHeight);
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.82,.65,.48]){
    const result=canvas.toDataURL('image/jpeg',quality);
    if(atob(result.split(',')[1]).length<=MAX_CLUB_PHOTO_BYTES)return result;
   }
  }
  throw Error('No pudimos optimizar esa foto. Prueba con una imagen más sencilla.');
 }finally{URL.revokeObjectURL(url);}
}
