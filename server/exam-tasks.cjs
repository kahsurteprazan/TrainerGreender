'use strict';
const {randomInt}=require('node:crypto');
const table=require('../table-ui.js');
  function evaluateFiveCards(cards) {
    const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
    const counts = {};
    ranks.forEach((rank) => {
      counts[rank] = (counts[rank] || 0) + 1;
    });
    const groups = Object.keys(counts)
      .map(Number)
      .sort((a, b) => counts[b] - counts[a] || b - a);
    const isFlush = cards.every((card) => card.suit === cards[0].suit);
    const uniqueRanks = [...new Set(ranks)];
    let straightHigh = 0;
    if (uniqueRanks.length === 5) {
      if (uniqueRanks[0] - uniqueRanks[4] === 4) straightHigh = uniqueRanks[0];
      else if (uniqueRanks.join(",") === "14,5,4,3,2") straightHigh = 5;
    }

    if (isFlush && straightHigh) return [8, straightHigh];
    if (groups.length === 2 && counts[groups[0]] === 4) return [7, groups[0], groups[1]];
    if (groups.length === 2 && counts[groups[0]] === 3) return [6, groups[0], groups[1]];
    if (isFlush) return [5, ...ranks];
    if (straightHigh) return [4, straightHigh];
    if (groups.length === 3 && counts[groups[0]] === 3) {
      return [3, groups[0], ...groups.slice(1).sort((a, b) => b - a)];
    }
    if (groups.length === 3 && counts[groups[0]] === 2 && counts[groups[1]] === 2) {
      return [2, Math.max(groups[0], groups[1]), Math.min(groups[0], groups[1]), groups[2]];
    }
    if (groups.length === 4 && counts[groups[0]] === 2) {
      return [1, groups[0], ...groups.slice(1).sort((a, b) => b - a)];
    }
    return [0, ...ranks];
  }

  function compareWinnerScores(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const difference = (a[i] || 0) - (b[i] || 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  function combinations(cards, size, start, result, output) {
    if (result.length === size) {
      output.push(result.slice());
      return;
    }
    for (let i = start; i <= cards.length - (size - result.length); i += 1) {
      result.push(cards[i]);
      combinations(cards, size, i + 1, result, output);
      result.pop();
    }
  }

  function bestWinnerHand(cards) {
    const hands = [];
    combinations(cards, 5, 0, [], hands);
    return hands.reduce((best, hand) => {
      const score = evaluateFiveCards(hand);
      if (!best || compareWinnerScores(score, best.score) > 0) return { score, cards: hand };
      return best;
    }, null);
  }


function shuffle(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function winner(){
 const deck=shuffle(['clubs','diamonds','hearts','spades'].flatMap(suit=>Array.from({length:13},(_,i)=>({rank:i+2,suit}))));
 const count=randomInt(2,6),players=Array.from({length:count},(_,i)=>({name:'Игрок '+(i+1),cards:[deck.pop(),deck.pop()]})),board=Array.from({length:5},()=>deck.pop());
 const scores=players.map(p=>bestWinnerHand([...p.cards,...board]).score),best=scores.reduce((a,b)=>compareWinnerScores(a,b)>=0?a:b);
 return{kind:'winner',prompt:'Выберите всех победителей раздачи.',players,board,answer:scores.flatMap((s,i)=>compareWinnerScores(s,best)===0?[i]:[])};
}
function sidepots(){
 const n=randomInt(4,8),small=randomInt(1,51)*100,big=randomInt(100,151)*100,bets=shuffle([small,...Array(n-1).fill(big)]),banks=table.layers(bets).filter(l=>!l.isReturn);
 return{kind:'sidepots',difficulty:'medium',prompt:'Рассчитайте основной банк и сайд-пот. Все игроки остаются в раздаче.',bets,bankCount:banks.length,answer:banks.map(l=>l.amount)};
}
function generate(){return[...Array.from({length:10},winner),...Array.from({length:10},sidepots)];}
module.exports={generate,winner,sidepots,evaluateFiveCards,bestWinnerHand,compareWinnerScores};
