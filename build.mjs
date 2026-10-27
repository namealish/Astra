import{cp,copyFile,mkdir,rm}from'node:fs/promises';
const out=new URL('./dist/',import.meta.url);
await rm(out,{force:true,recursive:true});await mkdir(out,{recursive:true});
for(const file of ['index.html','styles.css','cinematic.css','advanced.css','app.js','destinations.js','experience-state.js','experience-history.js','journey-experience.js','cinematic-motion.js','destination-explorer.js','planetarium.js','planet-shaders.js','scene-math.js','scene-renderer.js','departure-scene.js','departure-art.js','advanced-experiences.js','solar-system.js','solar-navigation.js','resort-lighting.js'])await copyFile(new URL(file,import.meta.url),new URL(file,out));
await copyFile(new URL('./render-budget.js',import.meta.url),new URL('render-budget.js',out));
await cp(new URL('./assets/',import.meta.url),new URL('./assets/',out),{recursive:true});
console.log('ASTRAEA static production files created in dist/');
