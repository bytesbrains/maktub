const { ethers } = require("hardhat");

const PER_RECIPIENT_FEE = ethers.parseEther("0.000005"); // D-023 target shape
const ENC_KEY = "0x02" + "11".repeat(32); // 33 bytes
const RATCHET_KEY = "0x03" + "22".repeat(32); // 33 bytes
const SAMPLE_PAYLOAD = ethers.toUtf8Bytes("QmFlashEnvelopeCIDxxxxxxxxxxx");

async function deployFixture() {
  const [deployer, sender, recipient1, recipient2, beatOnly, stranger, feeReceiver] =
    await ethers.getSigners();

  const V1 = await ethers.getContractFactory("RecipientRegistry");
  const v1 = await V1.deploy();

  const V2 = await ethers.getContractFactory("RecipientRegistryV2");
  const registry = await V2.deploy(await v1.getAddress());

  const Flash = await ethers.getContractFactory("MaktubFlash");
  const flash = await Flash.deploy(
    PER_RECIPIENT_FEE,
    feeReceiver.address,
    await registry.getAddress()
  );

  // recipient1 + recipient2 are Flash-eligible (ratchet key registered).
  await registry.connect(recipient1).register(ENC_KEY, RATCHET_KEY);
  await registry.connect(recipient2).register(ENC_KEY, RATCHET_KEY);
  // beatOnly registered on v2 without a ratchet key — NOT Flash-eligible.
  await registry.connect(beatOnly).register(ENC_KEY, "0x");

  return {
    v1,
    registry,
    flash,
    deployer,
    sender,
    recipient1,
    recipient2,
    beatOnly,
    stranger,
    feeReceiver,
  };
}

module.exports = {
  PER_RECIPIENT_FEE,
  ENC_KEY,
  RATCHET_KEY,
  SAMPLE_PAYLOAD,
  deployFixture,
};
