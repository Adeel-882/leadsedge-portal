import { describe, expect, it } from 'vitest';
import { messageInputSize } from '@/lib/message-input-size';

describe('content-measured message input', () => {
  it('grows through one, three and ten lines, and shrinks after deletion/send', () => {
    const size=(lines:number)=>messageInputSize(lines * 24 + 26,50,900,true,700,46);
    expect(size(1)).toEqual({height:50,overflow:'hidden'});
    expect(size(3)).toEqual({height:98,overflow:'hidden'});
    expect(size(10)).toEqual({height:266,overflow:'hidden'});
    expect(size(30)).toEqual({height:280,overflow:'auto'});
    expect(size(1)).toEqual({height:50,overflow:'hidden'});
  });
  it('caps pasted content at 38% of the mobile/tablet visual viewport', () => {
    expect(messageInputSize(2000,50,844,false,600,46)).toEqual({height:320.72,overflow:'auto'});
    expect(messageInputSize(2000,50,1024,false,850,46).height).toBeCloseTo(389.12);
  });
  it('reserves history when keyboard/header/navigation reduce available space', () => {
    const size=messageInputSize(2000,50,400,false,200,46);
    expect(size).toEqual({height:84,overflow:'auto'});
    expect(200-size.height-46).toBe(70);
  });
  it('handles width reflow, borders and short content after a capped message', () => {
    expect(messageInputSize(250,50,900,true).height).toBe(250);
    expect(messageInputSize(170,50,900,true)).toEqual({height:170,overflow:'hidden'});
    expect(messageInputSize(26,50,900,true)).toEqual({height:50,overflow:'hidden'});
  });
});
