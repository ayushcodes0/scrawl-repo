// Original word list for Scrawl. Short, drawable, everyday nouns and actions.
module.exports = `
apple banana carrot pizza burger sandwich donut cookie cupcake pancake waffle popcorn cheese egg bread
watermelon pineapple strawberry cherry grapes lemon mushroom onion potato tomato corn broccoli pumpkin
cat dog fish bird horse cow pig sheep goat chicken duck frog snake turtle rabbit mouse lion tiger bear
elephant giraffe zebra monkey kangaroo penguin owl eagle shark whale dolphin octopus crab snail spider
butterfly bee ant ladybug dragon unicorn dinosaur camel koala panda squirrel hedgehog bat parrot flamingo
house castle tent igloo bridge tower lighthouse windmill barn church school hospital skyscraper pyramid
car bus truck bicycle motorcycle train airplane helicopter rocket boat submarine tractor scooter skateboard
sun moon star cloud rain snow rainbow lightning tornado volcano mountain island beach desert forest river
tree flower cactus leaf mushroom palm rose sunflower grass bush
chair table bed sofa lamp door window clock mirror ladder bucket broom candle key lock umbrella
phone computer keyboard television camera radio headphones battery lightbulb robot magnet microscope
book pencil scissors ruler backpack envelope calendar map globe trophy medal crown flag balloon kite
guitar piano drum violin trumpet microphone
hat shoe sock glove scarf shirt dress glasses ring necklace watch belt boot
ball football basketball baseball tennis bowling golf hockey surfing skiing swimming boxing
hammer saw screwdriver wrench shovel axe anchor sword shield bow arrow cannon
toothbrush soap towel bathtub toilet shower sink fridge oven toaster kettle fork spoon knife plate cup bottle
heart skull ghost zombie vampire mermaid pirate wizard witch ninja astronaut clown king queen knight
snowman scarecrow angel devil alien
running jumping sleeping dancing singing crying laughing swimming climbing fishing cooking painting reading
smile tears sneeze yawn wink
bridge fence chimney mailbox fountain swing slide seesaw sandcastle campfire fireworks treasure
diamond coin wallet gift present ticket stamp puzzle dice cards chess yoyo
`.split(/\s+/).filter(Boolean).filter((w, i, a) => a.indexOf(w) === i);
