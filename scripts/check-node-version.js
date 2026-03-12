const major = Number.parseInt(process.versions.node.split('.')[0], 10);

if (Number.isNaN(major) || major < 20) {
  console.error(
    `Node.js version ${process.versions.node} is not supported. Required: >=20`,
  );
  process.exit(1);
}

console.log(`Node.js version check passed: ${process.versions.node}`);
