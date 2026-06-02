// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RCADE_ERC1155.sol";
import "../src/RCADEMarketplace.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy ERC1155 progression token contract
        RCADE_ERC1155 rcade = new RCADE_ERC1155();

        // 2. Deploy Marketplace contract
        // Setting treasury to deployer address and fee to 2.5% (250 BPS)
        RCADEMarketplace marketplace = new RCADEMarketplace(
            address(rcade),
            deployerAddress,
            250
        );

        vm.stopBroadcast();

        console.log("RCADE ERC1155 Deployed to:", address(rcade));
        console.log("RCADE Marketplace Deployed to:", address(marketplace));
    }
}

