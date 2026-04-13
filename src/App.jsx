import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "./api/rated.js";

const TMDB_IMG = "https://image.tmdb.org/t/p";

const MOVIE_CATALOG = [
  { id:"m-001", title:"Interstellar", original_title:"Interstellar", release_year:2014, runtime_minutes:169, content_rating:"PG-13", synopsis:"A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival. When Earth becomes uninhabitable, a former NASA pilot must leave his family behind to lead a mission through a newly discovered wormhole.", original_language:"en", is_international:false, poster_url:`${TMDB_IMG}/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg`, backdrop_url:`${TMDB_IMG}/w1280/xJHokMbljXjADYdit5fK1DVfjko.jpg`, genres:[{name:"Sci-Fi",slug:"sci-fi"},{name:"Drama",slug:"drama"},{name:"Adventure",slug:"adventure"}], directors:[{name:"Christopher Nolan"}], cast:[{name:"Matthew McConaughey",character_name:"Cooper"},{name:"Anne Hathaway",character_name:"Brand"},{name:"Jessica Chastain",character_name:"Murph"},{name:"Michael Caine",character_name:"Dr. Brand"}], trailers:[{title:"Official Trailer",video_key:"zSWdZVtXT7E",is_primary:true},{title:"IMAX Featurette",video_key:"abc123",is_primary:false}], keywords:["space","wormhole","nasa","black hole","time travel"], imdb_rating:8.7, rotten_tomatoes_score:73, global_elo_score:1952, global_rank:1, avg_user_rating:9.2, user_rating_count:3241, review_count:47, trending_score:892, trending_rank:3, is_highlighted:true, watchlist_count:1247, seen_count:8934 },
  { id:"m-002", title:"Parasite", original_title:"기생충", release_year:2019, runtime_minutes:132, content_rating:"R", synopsis:"Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.", original_language:"ko", is_international:true, poster_url:`${TMDB_IMG}/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg`, backdrop_url:`${TMDB_IMG}/w1280/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg`, genres:[{name:"Thriller",slug:"thriller"},{name:"Drama",slug:"drama"},{name:"Comedy",slug:"comedy"}], directors:[{name:"Bong Joon-ho"}], cast:[{name:"Song Kang-ho",character_name:"Ki-taek"},{name:"Lee Sun-kyun",character_name:"Dong-ik"},{name:"Cho Yeo-jeong",character_name:"Yeon-gyo"}], trailers:[{title:"Official Trailer",video_key:"SEUXfv87Wpk",is_primary:true}], keywords:["class differences","wealth","dark comedy","seoul"], imdb_rating:8.5, rotten_tomatoes_score:98, global_elo_score:1845, global_rank:3, avg_user_rating:9.0, user_rating_count:2890, review_count:62, trending_score:445, trending_rank:8, is_highlighted:false },
  { id:"m-003", title:"The Dark Knight", original_title:"The Dark Knight", release_year:2008, runtime_minutes:152, content_rating:"PG-13", synopsis:"Batman raises the stakes in his war on crime, facing the Joker, a criminal mastermind who plunges Gotham into anarchy.", original_language:"en", is_international:false, poster_url:`${TMDB_IMG}/w500/qJ2tW6WMUDux911BTUgMe1YRr.jpg`, genres:[{name:"Action",slug:"action"},{name:"Crime",slug:"crime"},{name:"Drama",slug:"drama"}], directors:[{name:"Christopher Nolan"}], cast:[{name:"Christian Bale",character_name:"Batman"},{name:"Heath Ledger",character_name:"Joker"}], trailers:[{title:"Official Trailer",video_key:"EXeTwQWrcwY",is_primary:true}], imdb_rating:9.0, global_elo_score:1823, global_rank:4, avg_user_rating:9.1, trending_score:320, trending_rank:12 },
  { id:"m-004", title:"Whiplash", release_year:2014, runtime_minutes:107, content_rating:"R", synopsis:"A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing.", original_language:"en", is_international:false, poster_url:`${TMDB_IMG}/w500/oPxnRhyAEBhPIT5uXGb02JMbuz.jpg`, genres:[{name:"Drama",slug:"drama"},{name:"Music",slug:"music"}], directors:[{name:"Damien Chazelle"}], cast:[{name:"Miles Teller",character_name:"Andrew"},{name:"J.K. Simmons",character_name:"Fletcher"}], imdb_rating:8.5, global_elo_score:1768, global_rank:8, avg_user_rating:8.9, trending_score:210 },
  { id:"m-005", title:"RRR", original_title:"RRR", release_year:2022, runtime_minutes:187, synopsis:"A fictitious story about two legendary revolutionaries and their journey away from home before they began fighting for their country in the 1920s.", original_language:"te", is_international:true, poster_url:`${TMDB_IMG}/w500/nEufeZYpKOlqp3fkDJKVECVpfjn.jpg`, genres:[{name:"Action",slug:"action"},{name:"Drama",slug:"drama"}], directors:[{name:"S.S. Rajamouli"}], cast:[{name:"N.T. Rama Rao Jr.",character_name:"Bheem"},{name:"Ram Charan",character_name:"Ram"}], imdb_rating:7.8, global_elo_score:1689, global_rank:14, avg_user_rating:8.4, trending_score:180 },
];

const UPCOMING_MOVIES = [
  { id:"u-001", title:"The Mummy", release_year:2026, release_date:"2026-05-15", days_until_release:43, poster_url:`${TMDB_IMG}/w500/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg`, genres:[{name:"Horror"}], directors:[{name:"Lee Cronin"}], anticipation_score:720, is_must_see:true, must_see_reason:"From the director of Evil Dead Rise", watchlist_count:342 },
  { id:"u-002", title:"Werwulf", release_year:2026, release_date:"2026-12-25", days_until_release:267, genres:[{name:"Horror"}], directors:[{name:"Robert Eggers"}], anticipation_score:890, is_must_see:true, must_see_reason:"Robert Eggers' werewolf epic", watchlist_count:512 },
  { id:"u-003", title:"Resident Evil", release_year:2026, release_date:"2026-08-14", days_until_release:134, genres:[{name:"Horror"},{name:"Action"}], directors:[{name:"Zach Cregger"}], anticipation_score:810, is_must_see:true, must_see_reason:"From the Barbarian director", watchlist_count:289 },
  { id:"u-004", title:"Scary Movie 6", release_year:2026, release_date:"2026-07-04", days_until_release:93, genres:[{name:"Comedy"},{name:"Horror"}], directors:[{name:"Keenen Ivory Wayans"}], anticipation_score:540, is_must_see:true, must_see_reason:"Wayans brothers return", watchlist_count:198 },
];

const FEED_ITEMS = [
  { id:"f-001", type:"rating", user:"@maya", avatar:"M", action:"rated", movie_title:"Interstellar", movie_id:"m-001", rating:9.5, time:"2m", likes:12, liked:false },
  { id:"f-002", type:"review", user:"@josh", avatar:"J", action:"reviewed", movie_title:"Parasite", movie_id:"m-002", preview:"Bong Joon-ho crafted something that transcends genre. The tonal shifts are masterful...", rating:9.0, time:"18m", likes:34, liked:false },
  { id:"f-003", type:"ranking", user:"@lina", avatar:"L", action:"updated rankings", preview:"New #1: The Dark Knight → dethroned Interstellar", time:"1h", likes:8, liked:false },
  { id:"f-004", type:"save", user:"@carlos", avatar:"C", action:"saved", movie_title:"RRR", movie_id:"m-005", time:"2h", likes:3, liked:false },
  { id:"f-005", type:"streak", user:"@maya", avatar:"M", action:"hit a 12-week streak 🔥", time:"3h", likes:45, liked:false },
];

const FRIEND_USERS = [
  { id:"u-maya", username:"maya", avatar:"M", is_following:false },
  { id:"u-josh", username:"josh", avatar:"J", is_following:true },
  { id:"u-lina", username:"lina", avatar:"L", is_following:false },
  { id:"u-carlos", username:"carlos", avatar:"C", is_following:true },
];

const USER = { username:"jasonk", current_streak_weeks:7, rated_count:89, review_count:23, following:34, followers:128, saved_movies:["m-001","m-002","m-005"] };

const W = { bg:"#0f0f13", card:"#1a1a22", border:"#2c2c3a", text:"#ededf2", dim:"#6e6e82", accent:"#ff3b3b", accentDim:"#ff3b3b28", green:"#10b981", greenDim:"#10b98122", gold:"#eab308", goldDim:"#eab30822", blue:"#3b82f6", blueDim:"#3b82f622", purple:"#a855f7", purpleDim:"#a855f722" };

const Phone = ({ children, label }) => (
  <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:8 }}>
    <div style={{ width:320,height:640,background:W.bg,borderRadius:36,border:`2.5px solid ${W.border}`,overflow:"hidden",position:"relative",boxShadow:`0 24px 80px rgba(0,0,0,0.6)` }}>
      <div style={{ position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:100,height:26,background:"#000",borderRadius:"0 0 18px 18px",zIndex:10 }} />
      <div style={{ height:44,display:"flex",alignItems:"flex-end",justifyContent:"space-between",padding:"0 24px 4px",fontSize:11,color:W.dim,fontFamily:"monospace" }}>
        <span style={{fontWeight:600}}>9:41</span><span>●●● ▐██▌</span>
      </div>
      <div style={{ height:596,display:"flex",flexDirection:"column",overflow:"hidden" }}>{children}</div>
    </div>
    <span style={{ fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",fontWeight:600 }}>{label}</span>
  </div>
);

const Poster = ({ url, w=85, h=120, radius=10 }) => (
  <div style={{ width:w,height:h,borderRadius:radius,overflow:"hidden",flexShrink:0,background:W.card,border:`1px solid ${W.border}` }}>
    {url && <img src={url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{e.target.style.display="none"}} />}
  </div>
);

const Btn = ({ children, accent, full, small, onClick }) => (
  <div onClick={onClick} style={{ background:accent?W.accent:"transparent",border:accent?"none":`1px solid ${W.border}`,color:accent?"#fff":W.dim,borderRadius:12,padding:small?"6px 14px":"12px 20px",fontSize:small?10:12,fontWeight:700,textAlign:"center",width:full?"100%":"auto",fontFamily:"monospace",cursor:"pointer" }}>{children}</div>
);

const NavBar = ({ active, onNav }) => (
  <div style={{ flexShrink:0,height:58,background:"#09090c",borderTop:`1px solid ${W.border}`,display:"flex",alignItems:"center",justifyContent:"space-around" }}>
    {[{key:"home",icon:"⌂",label:"Home"},{key:"upcoming",icon:"◈",label:"Soon"},{key:"search",icon:"⌕",label:"Search"},{key:"leaderboard",icon:"◆",label:"Board"},{key:"profile",icon:"●",label:"Me"}].map(item=>(
      <div key={item.key} onClick={()=>onNav(item.key)} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer" }}>
        <span style={{ fontSize:18,color:item.key===active?W.accent:W.dim }}>{item.icon}</span>
        <span style={{ fontSize:8,fontFamily:"monospace",color:item.key===active?W.accent:W.dim,fontWeight:item.key===active?700:400 }}>{item.label}</span>
      </div>
    ))}
  </div>
);

const Badge = ({ color, children }) => (
  <span style={{ padding:"2px 7px",borderRadius:4,fontSize:7,fontWeight:900,fontFamily:"monospace",background:color==="red"?W.accentDim:color==="gold"?W.goldDim:color==="green"?W.greenDim:color==="blue"?W.blueDim:W.purpleDim,color:color==="red"?W.accent:color==="gold"?W.gold:color==="green"?W.green:color==="blue"?W.blue:W.purple,border:`1px solid ${color==="red"?W.accent+"33":color==="gold"?W.gold+"33":color==="green"?W.green+"33":color==="blue"?W.blue+"33":W.purple+"33"}` }}>{children}</span>
);

const LoadingDots = () => {
  const [dots,setDots]=useState("");
  useEffect(()=>{const i=setInterval(()=>setDots(d=>d.length>=3?"":d+"."),400);return()=>clearInterval(i);},[]);
  return <span style={{ color:W.dim,fontFamily:"monospace",fontSize:11 }}>Loading{dots}</span>;
};

const LoginScreen = ({ onLogin }) => (
  <div style={{ height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 28px" }}>
    <div style={{ textAlign:"center",marginBottom:40 }}>
      <div style={{ fontSize:42,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-2,lineHeight:1 }}>RATED</div>
      <div style={{ fontSize:10,color:W.dim,marginTop:8,fontFamily:"monospace",letterSpacing:3 }}>YOUR TASTE. RANKED.</div>
    </div>
    <div onClick={onLogin} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#fff",borderRadius:12,padding:"13px 20px",cursor:"pointer",marginBottom:10 }}>
      <span style={{ fontSize:18,color:"#000" }}></span>
      <span style={{ fontSize:13,fontWeight:600,color:"#000",fontFamily:"system-ui" }}>Continue with Apple</span>
    </div>
    <div onClick={onLogin} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"13px 20px",cursor:"pointer" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" style={{flexShrink:0}}>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span style={{ fontSize:13,fontWeight:600,color:W.text,fontFamily:"system-ui" }}>Continue with Google</span>
    </div>
    <div style={{ textAlign:"center",marginTop:32 }}>
      <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1 }}>NO PASSWORD NEEDED</div>
    </div>
  </div>
);

const HomeScreen = ({ onNav, onSelectMovie }) => {
  const [loaded,setLoaded]=useState(false);
  const [feedLikes,setFeedLikes]=useState({});
  const [following,setFollowing]=useState(()=>{const m={};FRIEND_USERS.forEach(u=>{m[u.id]=u.is_following;});return m;});
  const [savedMovies,setSavedMovies]=useState(new Set(USER.saved_movies));
  useEffect(()=>{setTimeout(()=>setLoaded(true),600);},[]);
  const toggleLike=(id)=>setFeedLikes(p=>({...p,[id]:!p[id]}));
  const toggleFollow=(id)=>setFollowing(p=>({...p,[id]:!p[id]}));
  const toggleSave=(id)=>setSavedMovies(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const highlights=MOVIE_CATALOG.filter(m=>m.is_highlighted||m.trending_rank<=5).slice(0,4);
  if(!loaded) return <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}><LoadingDots/></div>;
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ flexShrink:0,padding:"6px 22px 0",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ fontSize:18,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1 }}>RATED</div>
        <div style={{ display:"flex",gap:3,alignItems:"center",background:W.goldDim,border:`1px solid ${W.gold}44`,borderRadius:20,padding:"3px 10px" }}>
          <span style={{ fontSize:12 }}>🔥</span>
          <span style={{ fontSize:10,fontWeight:800,color:W.gold,fontFamily:"monospace" }}>{USER.current_streak_weeks}</span>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"10px 22px",display:"flex",flexDirection:"column",gap:12 }}>
        <div style={{ fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1.5 }}>HIGHLIGHTS</div>
        <div style={{ display:"flex",gap:10,overflowX:"auto",paddingBottom:4 }}>
          {highlights.map(m=>(
            <div key={m.id} style={{ flexShrink:0,width:105 }}>
              <div style={{ position:"relative",cursor:"pointer" }} onClick={()=>onSelectMovie(m)}>
                <Poster url={m.poster_url} w={105} h={148} radius={12}/>
                {m.trending_rank&&m.trending_rank<=3&&<div style={{ position:"absolute",top:6,left:6,background:W.accent,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:4,fontFamily:"monospace" }}>#{m.trending_rank}</div>}
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:5 }}>
                <div style={{ minWidth:0,flex:1 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{m.title}</div>
                  <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{m.release_year}</div>
                </div>
                <div onClick={(e)=>{e.stopPropagation();toggleSave(m.id);}} style={{ cursor:"pointer",fontSize:14,flexShrink:0,marginLeft:4 }}>
                  {savedMovies.has(m.id)?<span style={{color:W.blue}}>◆</span>:<span style={{color:W.dim}}>◇</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1.5 }}>ACTIVITY</div>
        {FEED_ITEMS.map(item=>{
          const isLiked=feedLikes[item.id]??item.liked;
          const likeCount=(item.likes||0)+(feedLikes[item.id]&&!item.liked?1:0)-(!feedLikes[item.id]&&item.liked?1:0);
          const friendUser=FRIEND_USERS.find(u=>`@${u.username}`===item.user);
          const isFollowing=friendUser?following[friendUser.id]:false;
          return (
            <div key={item.id} style={{ background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:12 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                <div style={{ width:30,height:30,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0 }}>{item.avatar}</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <span style={{ fontSize:11,fontWeight:700,color:W.accent,fontFamily:"monospace" }}>{item.user}</span>
                    {friendUser&&<div onClick={()=>toggleFollow(friendUser.id)} style={{ cursor:"pointer",padding:"1px 8px",borderRadius:10,fontSize:8,fontWeight:700,fontFamily:"monospace",background:isFollowing?W.accentDim:"transparent",border:`1px solid ${isFollowing?W.accent:W.border}`,color:isFollowing?W.accent:W.dim }}>{isFollowing?"FOLLOWING":"+ FOLLOW"}</div>}
                  </div>
                  <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{item.time} ago</div>
                </div>
              </div>
              <div style={{ fontSize:11,color:W.text,fontFamily:"monospace",lineHeight:1.5,marginBottom:6 }}>
                {item.type==="rating"&&<span>{item.action} <span style={{color:W.gold,fontWeight:700}}>{item.movie_title}</span> <span style={{color:W.gold}}>★ {item.rating}/10</span></span>}
                {item.type==="review"&&<div><span>{item.action} <span style={{color:W.gold,fontWeight:700}}>{item.movie_title}</span> <span style={{color:W.gold}}>★ {item.rating}/10</span></span><div style={{ fontSize:10,color:W.dim,marginTop:4,fontStyle:"italic" }}>"{item.preview?.slice(0,100)}..."</div></div>}
                {item.type==="ranking"&&<div><span>{item.action}</span><div style={{ fontSize:10,color:W.dim,marginTop:2 }}>{item.preview}</div></div>}
                {item.type==="save"&&<span>saved <span style={{color:W.blue,fontWeight:700}}>{item.movie_title}</span> to watch later 🎬</span>}
                {item.type==="streak"&&<span>{item.action}</span>}
              </div>
              <div style={{ display:"flex",gap:14,alignItems:"center",paddingTop:6,borderTop:`1px solid ${W.border}` }}>
                <div onClick={()=>toggleLike(item.id)} style={{ display:"flex",alignItems:"center",gap:4,cursor:"pointer" }}>
                  <span style={{ fontSize:14,color:isLiked?W.accent:W.dim }}>{isLiked?"♥":"♡"}</span>
                  <span style={{ fontSize:10,color:isLiked?W.accent:W.dim,fontFamily:"monospace" }}>{likeCount}</span>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:4,cursor:"pointer" }}>
                  <span style={{ fontSize:12,color:W.dim }}>💬</span>
                  <span style={{ fontSize:10,color:W.dim,fontFamily:"monospace" }}>Reply</span>
                </div>
                {item.movie_id&&<div onClick={()=>toggleSave(item.movie_id)} style={{ display:"flex",alignItems:"center",gap:4,cursor:"pointer",marginLeft:"auto" }}>
                  <span style={{ fontSize:13,color:savedMovies.has(item.movie_id)?W.blue:W.dim }}>{savedMovies.has(item.movie_id)?"◆":"◇"}</span>
                  <span style={{ fontSize:10,color:savedMovies.has(item.movie_id)?W.blue:W.dim,fontFamily:"monospace" }}>{savedMovies.has(item.movie_id)?"Saved":"Save"}</span>
                </div>}
              </div>
            </div>
          );
        })}
        {savedMovies.size>0&&<>
          <div style={{ fontSize:11,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1.5 }}>YOUR SAVED · {savedMovies.size} FILMS</div>
          <div style={{ display:"flex",gap:8,overflowX:"auto" }}>
            {MOVIE_CATALOG.filter(m=>savedMovies.has(m.id)).map(m=>(
              <div key={m.id} style={{ flexShrink:0,cursor:"pointer",position:"relative" }} onClick={()=>onSelectMovie(m)}>
                <Poster url={m.poster_url} w={60} h={84} radius={8}/>
                <div style={{ position:"absolute",top:3,right:3,width:14,height:14,background:W.blue,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff" }}>◆</div>
                <div style={{ fontSize:8,color:W.dim,fontFamily:"monospace",marginTop:2,textAlign:"center",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{m.title}</div>
              </div>
            ))}
          </div>
        </>}
      </div>
      <NavBar active="home" onNav={onNav}/>
    </div>
  );
};

const ReviewModal = ({ movie, onClose }) => {
  const [text,setText]=useState("");
  const [rating,setRating]=useState(0);
  const [hover,setHover]=useState(0);
  const [submitted,setSubmitted]=useState(false);
  const handleSubmit=()=>{if(!rating||!text.trim())return;setSubmitted(true);setTimeout(onClose,1200);};
  return (
    <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",zIndex:50,display:"flex",flexDirection:"column",justifyContent:"flex-end" }}>
      <div style={{ background:W.bg,borderRadius:"20px 20px 0 0",padding:"20px 22px 32px",display:"flex",flexDirection:"column",gap:14 }}>
        {submitted?<div style={{ textAlign:"center",padding:"20px 0" }}><div style={{ fontSize:32,marginBottom:8 }}>✓</div><div style={{ fontSize:14,fontWeight:900,color:W.green,fontFamily:"monospace" }}>Review Posted!</div></div>:<>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace" }}>✎ WRITE REVIEW</div>
            <div onClick={onClose} style={{ fontSize:18,color:W.dim,cursor:"pointer" }}>✕</div>
          </div>
          <div style={{ display:"flex",gap:10,alignItems:"center" }}>
            <Poster url={movie.poster_url} w={40} h={56} radius={6}/>
            <div><div style={{ fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace" }}>{movie.title}</div><div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{movie.release_year} · {movie.directors?.[0]?.name}</div></div>
          </div>
          <div>
            <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginBottom:6,letterSpacing:1 }}>YOUR RATING</div>
            <div style={{ display:"flex",gap:4 }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <div key={n} onClick={()=>setRating(n)} onMouseEnter={()=>setHover(n)} onMouseLeave={()=>setHover(0)} style={{ flex:1,textAlign:"center",padding:"6px 0",borderRadius:6,fontSize:10,fontWeight:900,fontFamily:"monospace",cursor:"pointer",background:(hover||rating)>=n?W.goldDim:W.card,border:`1px solid ${(hover||rating)>=n?W.gold:W.border}`,color:(hover||rating)>=n?W.gold:W.dim }}>{n}</div>
              ))}
            </div>
            {rating>0&&<div style={{ fontSize:9,color:W.gold,fontFamily:"monospace",marginTop:4,textAlign:"center" }}>★ {rating}/10</div>}
          </div>
          <div>
            <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginBottom:6,letterSpacing:1 }}>YOUR REVIEW</div>
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="What did you think? Be honest..." style={{ width:"100%",minHeight:80,background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"10px 14px",fontSize:11,color:W.text,fontFamily:"monospace",outline:"none",resize:"none",boxSizing:"border-box",lineHeight:1.6 }}/>
            <div style={{ fontSize:8,color:W.dim,fontFamily:"monospace",textAlign:"right",marginTop:2 }}>{text.length}/500</div>
          </div>
          <div onClick={handleSubmit} style={{ background:rating&&text.trim()?W.accent:W.card,border:`1px solid ${rating&&text.trim()?W.accent:W.border}`,color:rating&&text.trim()?"#fff":W.dim,borderRadius:12,padding:"12px",fontSize:12,fontWeight:700,textAlign:"center",fontFamily:"monospace",cursor:rating&&text.trim()?"pointer":"default" }}>POST REVIEW</div>
        </>}
      </div>
    </div>
  );
};

const MovieDetailScreen = ({ movie, onBack, onRank }) => {
  const [loaded,setLoaded]=useState(false);
  const [saved,setSaved]=useState(()=>USER.saved_movies.includes(movie?.id));
  const [showReview,setShowReview]=useState(false);
  useEffect(()=>{setLoaded(false);setSaved(USER.saved_movies.includes(movie?.id));setShowReview(false);setTimeout(()=>setLoaded(true),400);},[movie?.id]);
  if(!movie) return null;
  if(!loaded) return <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}><LoadingDots/></div>;
  const m=movie;
  const primaryTrailer=m.trailers?.find(t=>t.is_primary)||m.trailers?.[0];
  return (
    <div style={{ position:"relative",display:"flex",flexDirection:"column",height:"100%" }}>
      {showReview&&<ReviewModal movie={m} onClose={()=>setShowReview(false)}/>}
      <div style={{ flexShrink:0,position:"relative",height:180,background:`linear-gradient(180deg,#1a1a28,${W.bg})`,overflow:"hidden" }}>
        {m.backdrop_url&&<img src={m.backdrop_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",opacity:0.3 }} onError={e=>{e.target.style.display="none"}}/>}
        <div style={{ position:"absolute",top:10,left:16,fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer" }} onClick={onBack}>← Back</div>
        {primaryTrailer&&<div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}><div style={{ width:44,height:44,background:`${W.accent}cc`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff" }}>▶</div><span style={{ fontSize:9,color:"#fff",fontFamily:"monospace",fontWeight:600 }}>PLAY TRAILER</span></div>}
        <div style={{ position:"absolute",bottom:-40,left:22 }}><Poster url={m.poster_url} w={72} h={100} radius={10}/></div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"48px 22px 20px",display:"flex",flexDirection:"column",gap:8 }}>
        <div>
          <div style={{ display:"flex",gap:6,alignItems:"center" }}>
            <span style={{ fontSize:18,fontWeight:900,color:W.text,fontFamily:"monospace",letterSpacing:-0.5 }}>{m.title}</span>
            {m.is_international&&<Badge color="purple">{m.original_language?.toUpperCase()}</Badge>}
          </div>
          {m.original_title&&m.original_title!==m.title&&<div style={{ fontSize:10,color:W.dim,fontFamily:"monospace",fontStyle:"italic" }}>{m.original_title}</div>}
          <div style={{ fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:3 }}>{m.release_year} · {m.directors?.[0]?.name} · {Math.floor((m.runtime_minutes||0)/60)}h {(m.runtime_minutes||0)%60}m · {m.content_rating||"NR"}</div>
        </div>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {m.global_rank&&<div style={{ background:W.accentDim,border:`1px solid ${W.accent}33`,borderRadius:10,padding:"6px 12px",textAlign:"center" }}><div style={{ fontSize:16,fontWeight:900,color:W.accent,fontFamily:"monospace" }}>#{m.global_rank}</div><div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>RATED</div></div>}
          {m.imdb_rating&&<div style={{ background:W.goldDim,border:`1px solid ${W.gold}33`,borderRadius:10,padding:"6px 12px",textAlign:"center" }}><div style={{ fontSize:16,fontWeight:900,color:W.gold,fontFamily:"monospace" }}>{m.imdb_rating}</div><div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>IMDb</div></div>}
          {m.rotten_tomatoes_score&&<div style={{ background:W.greenDim,border:`1px solid ${W.green}33`,borderRadius:10,padding:"6px 12px",textAlign:"center" }}><div style={{ fontSize:16,fontWeight:900,color:W.green,fontFamily:"monospace" }}>{m.rotten_tomatoes_score}%</div><div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>RT</div></div>}
          <div style={{ background:W.blueDim,border:`1px solid ${W.blue}33`,borderRadius:10,padding:"6px 12px",textAlign:"center",flex:1 }}><div style={{ fontSize:16,fontWeight:900,color:W.blue,fontFamily:"monospace" }}>{m.global_elo_score}</div><div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>ELO</div></div>
        </div>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
          {m.genres?.map(g=><span key={g.slug||g.name} style={{ padding:"3px 10px",borderRadius:16,fontSize:9,fontFamily:"monospace",fontWeight:600,background:W.card,border:`1px solid ${W.border}`,color:W.dim }}>{g.name}</span>)}
        </div>
        <div style={{ fontSize:11,color:W.dim,fontFamily:"monospace",lineHeight:1.6 }}>{m.synopsis?.slice(0,180)}{m.synopsis?.length>180&&<span style={{ color:W.accent,fontWeight:600 }}> read more</span>}</div>
        <div style={{ display:"flex",gap:6 }}>
          <div style={{ flex:1 }} onClick={()=>onRank&&onRank(m)}><Btn accent full small>⚡ RANK</Btn></div>
          <div style={{ flex:1 }} onClick={()=>setSaved(!saved)}>
            <div style={{ background:saved?W.blueDim:"transparent",border:`1px solid ${saved?W.blue:W.border}`,color:saved?W.blue:W.dim,borderRadius:12,padding:"6px 14px",fontSize:10,fontWeight:700,textAlign:"center",fontFamily:"monospace",cursor:"pointer" }}>{saved?"◆ SAVED":"◇ SAVE"}</div>
          </div>
          <div style={{ flex:1 }} onClick={()=>setShowReview(true)}><Btn full small>✎ REVIEW</Btn></div>
        </div>
        {m.cast&&m.cast.length>0&&<>
          <div style={{ fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:4 }}>CAST</div>
          <div style={{ display:"flex",gap:10,overflowX:"auto" }}>
            {m.cast.slice(0,5).map((c,i)=>(
              <div key={i} style={{ textAlign:"center",flexShrink:0 }}>
                <div style={{ width:40,height:40,borderRadius:"50%",background:W.card,border:`1px solid ${W.border}`,margin:"0 auto 3px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>👤</div>
                <div style={{ fontSize:9,fontWeight:700,color:W.text,fontFamily:"monospace",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.name.split(" ").pop()}</div>
                <div style={{ fontSize:8,color:W.dim,fontFamily:"monospace" }}>{c.character_name}</div>
              </div>
            ))}
          </div>
        </>}
        {m.trailers&&m.trailers.length>0&&<>
          <div style={{ fontSize:10,fontWeight:700,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:4 }}>TRAILERS</div>
          <div style={{ display:"flex",gap:8,overflowX:"auto" }}>
            {m.trailers.map((t,i)=>(
              <div key={i} style={{ position:"relative",flexShrink:0 }}>
                <div style={{ width:140,height:78,borderRadius:10,overflow:"hidden",background:"linear-gradient(135deg,#1c1c2c,#2a2a3a)" }}>
                  <img src={`https://img.youtube.com/vi/${t.video_key}/hqdefault.jpg`} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",opacity:0.7 }} onError={e=>{e.target.style.display="none"}}/>
                </div>
                <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:22,height:22,background:`${W.accent}cc`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff" }}>▶</div>
                <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:3 }}>{t.title}</div>
              </div>
            ))}
          </div>
        </>}
        <div style={{ display:"flex",gap:8,marginTop:4 }}>
          {[{n:m.user_rating_count||0,l:"Ratings"},{n:m.review_count||0,l:"Reviews"},{n:m.watchlist_count||0,l:"Watchlisted"},{n:m.seen_count||0,l:"Seen"}].map((s,i)=>(
            <div key={i} style={{ flex:1,textAlign:"center",background:W.card,borderRadius:8,padding:"6px 4px",border:`1px solid ${W.border}` }}>
              <div style={{ fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>{s.n>999?`${(s.n/1000).toFixed(1)}k`:s.n}</div>
              <div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>{s.l}</div>
            </div>
          ))}
        </div>
        {m.keywords&&<div style={{ display:"flex",gap:4,flexWrap:"wrap",marginTop:2 }}>{m.keywords.slice(0,6).map(k=><span key={k} style={{ padding:"2px 8px",borderRadius:10,fontSize:8,fontFamily:"monospace",background:W.card,border:`1px solid ${W.border}`,color:W.dim }}>#{k}</span>)}</div>}
      </div>
    </div>
  );
};

const UpcomingScreen = ({ onNav }) => (
  <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
    <div style={{ flexShrink:0 }}>
    <div style={{ padding:"8px 22px 6px",fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>◈ UPCOMING · MUST SEE</div>
    <div style={{ display:"flex",gap:6,padding:"0 22px 8px" }}>
      {["All","Horror","Action","Drama"].map((t,i)=>(
        <span key={t} style={{ padding:"4px 12px",borderRadius:16,fontSize:9,fontFamily:"monospace",fontWeight:600,background:i===0?W.accentDim:W.card,border:`1px solid ${i===0?W.accent:W.border}`,color:i===0?W.accent:W.dim }}>{t}</span>
      ))}
    </div>
    </div>
    <div style={{ flex:1,overflowY:"auto",padding:"0 22px",display:"flex",flexDirection:"column",gap:10 }}>
      {[...UPCOMING_MOVIES].sort((a,b)=>a.days_until_release-b.days_until_release).map(u=>(
        <div key={u.id} style={{ background:W.card,border:`1px solid ${u.is_must_see?W.accent+"33":W.border}`,borderRadius:14,padding:14 }}>
          <div style={{ display:"flex",gap:12 }}>
            <Poster url={u.poster_url} w={56} h={78} radius={8}/>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                <span style={{ fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>{u.title}</span>
                {u.is_must_see&&<Badge color="red">MUST SEE</Badge>}
              </div>
              <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2 }}>{u.directors?.[0]?.name} · {u.genres?.map(g=>g.name).join(", ")}</div>
              <div style={{ fontSize:10,color:W.gold,fontFamily:"monospace",marginTop:4 }}>{u.must_see_reason}</div>
              <div style={{ display:"flex",gap:10,marginTop:6 }}>
                <div style={{ fontSize:10,color:W.dim,fontFamily:"monospace" }}>📅 {u.release_date}</div>
                <div style={{ fontSize:10,color:W.accent,fontFamily:"monospace",fontWeight:700 }}>{u.days_until_release}d away</div>
              </div>
              <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:4 }}>👀 {u.watchlist_count} watching · 📊 hype: {u.anticipation_score}</div>
            </div>
          </div>
          <div style={{ display:"flex",gap:8,marginTop:10 }}>
            <div style={{ flex:1 }}><Btn accent full small>+ WATCHLIST</Btn></div>
            <div style={{ flex:1 }}><Btn full small>🔔 NOTIFY ME</Btn></div>
          </div>
        </div>
      ))}
    </div>
    <NavBar active="upcoming" onNav={onNav}/>
  </div>
);

const LeaderboardScreen = ({ onNav, onSelectMovie }) => {
  const [tab,setTab]=useState("global");
  const GLOBAL=[{rank:1,user:"@cinephile99",avatar:"C",movies_rated:847,streak:34,badge:"💎"},{rank:2,user:"@filmfreak",avatar:"F",movies_rated:612,streak:21,badge:"🏆"},{rank:3,user:"@maya",avatar:"M",movies_rated:489,streak:12,badge:"🏆"},{rank:4,user:"@reeltalks",avatar:"R",movies_rated:356,streak:8,badge:"🔥"},{rank:5,user:"@jasonk",avatar:"J",movies_rated:89,streak:7,badge:"🔥",isYou:true},{rank:6,user:"@josh",avatar:"J",movies_rated:76,streak:4,badge:""},{rank:7,user:"@lina",avatar:"L",movies_rated:63,streak:3,badge:""},{rank:8,user:"@carlos",avatar:"C",movies_rated:41,streak:1,badge:""}];
  const FRIENDS=[{rank:1,title:"Interstellar",movie_id:"m-001",avg_rating:9.4,rated_by:["@maya","@josh","@lina"],rated_count:3},{rank:2,title:"Parasite",movie_id:"m-002",avg_rating:9.1,rated_by:["@maya","@carlos"],rated_count:2},{rank:3,title:"The Dark Knight",movie_id:"m-003",avg_rating:8.8,rated_by:["@josh","@lina","@carlos"],rated_count:3},{rank:4,title:"Whiplash",movie_id:"m-004",avg_rating:8.7,rated_by:["@maya"],rated_count:1},{rank:5,title:"RRR",movie_id:"m-005",avg_rating:8.4,rated_by:["@carlos","@lina"],rated_count:2}];
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ flexShrink:0 }}>
      <div style={{ padding:"8px 22px 6px" }}><span style={{ fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>◆ LEADERBOARD</span></div>
      <div style={{ display:"flex",margin:"0 22px",borderBottom:`1px solid ${W.border}` }}>
        {[{key:"global",label:"Most Rated Users"},{key:"following",label:"Friends' Rankings"}].map(t=>(
          <div key={t.key} onClick={()=>setTab(t.key)} style={{ flex:1,textAlign:"center",padding:"8px 0",fontSize:10,fontFamily:"monospace",fontWeight:600,color:tab===t.key?W.accent:W.dim,borderBottom:`2px solid ${tab===t.key?W.accent:"transparent"}`,cursor:"pointer" }}>{t.label}</div>
        ))}
      </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"10px 22px",display:"flex",flexDirection:"column",gap:6 }}>
        {tab==="global"&&GLOBAL.map(u=>(
          <div key={u.rank} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:u.isYou?W.accentDim:u.rank<=3?`${W.gold}08`:W.card,borderRadius:10,border:`1px solid ${u.isYou?W.accent+"33":u.rank<=3?W.gold+"22":W.border}` }}>
            <span style={{ width:20,fontSize:u.rank<=3?14:11,fontWeight:900,color:W.dim,fontFamily:"monospace",textAlign:"center" }}>{u.rank<=3?["🥇","🥈","🥉"][u.rank-1]:u.rank}</span>
            <div style={{ width:30,height:30,borderRadius:"50%",background:W.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace",flexShrink:0 }}>{u.avatar}</div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"flex",gap:4,alignItems:"center" }}>
                <span style={{ fontSize:11,fontWeight:700,color:u.isYou?W.accent:W.text,fontFamily:"monospace" }}>{u.user}</span>
                {u.isYou&&<span style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>(you)</span>}
                {u.badge&&<span style={{ fontSize:10 }}>{u.badge}</span>}
              </div>
              <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{u.streak>0&&`🔥 ${u.streak}w streak`}</div>
            </div>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:14,fontWeight:900,color:W.gold,fontFamily:"monospace" }}>{u.movies_rated}</div><div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>FILMS</div></div>
          </div>
        ))}
        {tab==="following"&&FRIENDS.map(m=>{
          const movie=MOVIE_CATALOG.find(c=>c.id===m.movie_id);
          return (
            <div key={m.rank} onClick={()=>movie&&onSelectMovie(movie)} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:m.rank<=3?`${W.accent}08`:W.card,borderRadius:10,border:`1px solid ${m.rank<=3?W.accent+"22":W.border}`,cursor:movie?"pointer":"default" }}>
              <span style={{ width:20,fontSize:m.rank<=3?14:11,fontWeight:900,color:W.dim,fontFamily:"monospace",textAlign:"center" }}>{m.rank<=3?["🥇","🥈","🥉"][m.rank-1]:m.rank}</span>
              <Poster url={movie?.poster_url} w={32} h={44} radius={6}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace" }}>{m.title}</div>
                <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2 }}>Rated by {m.rated_by.slice(0,2).join(", ")}{m.rated_count>2&&` +${m.rated_count-2} more`}</div>
              </div>
              <div style={{ textAlign:"right" }}><div style={{ fontSize:14,fontWeight:900,color:W.gold,fontFamily:"monospace" }}>★ {m.avg_rating}</div><div style={{ fontSize:7,color:W.dim,fontFamily:"monospace" }}>AVG</div></div>
            </div>
          );
        })}
      </div>
      <NavBar active="leaderboard" onNav={onNav}/>
    </div>
  );
};

const SearchScreen = ({ onNav, onSelectMovie }) => {
  const [query,setQuery]=useState("");
  const results=query.length>1?MOVIE_CATALOG.filter(m=>m.title.toLowerCase().includes(query.toLowerCase())):[];
  const noResults=query.length>2&&results.length===0;
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"8px 22px 6px",flexShrink:0 }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕ Search movies, directors..." style={{ width:"100%",background:W.card,border:`1px solid ${W.border}`,borderRadius:12,padding:"11px 16px",fontSize:12,color:W.text,fontFamily:"monospace",outline:"none",boxSizing:"border-box" }}/>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"0 22px" }}>
        {results.map(m=>(
          <div key={m.id} onClick={()=>onSelectMovie(m)} style={{ display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${W.border}`,cursor:"pointer" }}>
            <Poster url={m.poster_url} w={36} h={50} radius={6}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace" }}>{m.title}</div>
              <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{m.release_year} · {m.directors?.[0]?.name}</div>
            </div>
            <div style={{ fontSize:10,fontWeight:800,color:W.gold,fontFamily:"monospace" }}>#{m.global_rank||"—"}</div>
          </div>
        ))}
        {noResults&&<div style={{ textAlign:"center",padding:"24px 0" }}><div style={{ fontSize:24,marginBottom:8 }}>🔍</div><div style={{ fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace" }}>No results for "{query}"</div></div>}
        {query.length<=1&&<>
          <div style={{ fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:8 }}>TRENDING</div>
          {[...MOVIE_CATALOG].sort((a,b)=>(a.trending_rank||99)-(b.trending_rank||99)).slice(0,5).map(m=>(
            <div key={m.id} onClick={()=>onSelectMovie(m)} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${W.border}`,cursor:"pointer" }}>
              <span style={{ fontSize:11,color:W.dim }}>🔥</span>
              <span style={{ fontSize:12,color:W.text,fontFamily:"monospace",flex:1 }}>{m.title}</span>
              {m.is_international&&<Badge color="purple">{m.original_language}</Badge>}
              <span style={{ fontSize:10,color:W.dim }}>→</span>
            </div>
          ))}
          <div style={{ fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginTop:12 }}>BROWSE</div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginTop:4 }}>
            {["🎭 Drama","🚀 Sci-Fi","😱 Horror","😂 Comedy","💥 Action","🌏 International"].map(c=>(
              <span key={c} style={{ padding:"7px 14px",borderRadius:10,fontSize:10,fontFamily:"monospace",fontWeight:600,background:W.card,border:`1px solid ${W.border}`,color:W.dim }}>{c}</span>
            ))}
          </div>
        </>}
      </div>
      <NavBar active="search" onNav={onNav}/>
    </div>
  );
};

const ProfileScreen = ({ onNav, onSelectMovie, rankedIds, eloScores }) => {
  const [tab,setTab]=useState("rankings");
  const savedMovies=MOVIE_CATALOG.filter(m=>USER.saved_movies.includes(m.id));
  const allRankings=rankedIds.map(id=>{const c=MOVIE_CATALOG.find(m=>m.id===id);return c?{...c,movie_type:"catalog"}:null;}).filter(Boolean);
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ flexShrink:0 }}>
      <div style={{ padding:"8px 22px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>MY PROFILE</span>
        <span style={{ fontSize:14 }}>⚙</span>
      </div>
      <div style={{ padding:"0 22px",display:"flex",gap:14,alignItems:"center" }}>
        <div style={{ width:54,height:54,borderRadius:"50%",background:W.card,border:`2px solid ${W.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26 }}>👤</div>
        <div>
          <div style={{ fontSize:15,fontWeight:900,color:W.text,fontFamily:"monospace" }}>@{USER.username}</div>
          <div style={{ display:"flex",gap:4,alignItems:"center",marginTop:2 }}><span style={{ fontSize:12 }}>🔥</span><span style={{ fontSize:10,fontWeight:700,color:W.gold,fontFamily:"monospace" }}>{USER.current_streak_weeks}-week streak</span></div>
        </div>
      </div>
      <div style={{ display:"flex",padding:"14px 22px" }}>
        {[{n:allRankings.length,l:"Ranked"},{n:savedMovies.length,l:"Saved"},{n:USER.following,l:"Following"},{n:USER.followers,l:"Followers"}].map((s,i)=>(
          <div key={i} style={{ flex:1,textAlign:"center" }}>
            <div style={{ fontSize:16,fontWeight:900,color:i===0?W.accent:W.text,fontFamily:"monospace" }}>{s.n}</div>
            <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex",borderBottom:`1px solid ${W.border}`,margin:"0 22px" }}>
        {["rankings","saved","reviews","notes"].map(t=>(
          <div key={t} onClick={()=>setTab(t)} style={{ flex:1,textAlign:"center",padding:"8px 0",fontSize:10,fontFamily:"monospace",fontWeight:600,color:tab===t?W.accent:W.dim,borderBottom:`2px solid ${tab===t?W.accent:"transparent"}`,cursor:"pointer",textTransform:"capitalize" }}>{t}</div>
        ))}
      </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"10px 22px",display:"flex",flexDirection:"column",gap:5 }}>
        {tab==="rankings"&&<>
          <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1 }}>YOUR PERSONAL RANKINGS · {allRankings.length} films</div>
          {allRankings.length===0&&<div style={{ textAlign:"center",padding:"24px 0" }}><div style={{ fontSize:28,marginBottom:6 }}>🎬</div><div style={{ fontSize:12,fontWeight:700,color:W.text,fontFamily:"monospace" }}>No rankings yet</div><div style={{ fontSize:10,color:W.dim,fontFamily:"monospace",marginTop:4,lineHeight:1.5 }}>Tap ⚡ RANK on any movie to add it</div></div>}
          {allRankings.map((m,i)=>(
            <div key={m.id} onClick={()=>onSelectMovie(m)} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:i===0?W.goldDim:W.card,borderRadius:10,border:`1px solid ${i===0?W.gold+"44":W.border}`,cursor:"pointer" }}>
              <span style={{ fontSize:i<3?13:11,fontWeight:900,color:W.dim,fontFamily:"monospace",width:18,textAlign:"center",flexShrink:0 }}>{i<3?["🥇","🥈","🥉"][i]:i+1}</span>
              <Poster url={m.poster_url} w={28} h={38} radius={4}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:11,color:W.text,fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{m.title}</div>
                <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{m.release_year}</div>
              </div>
              <span style={{ fontSize:9,color:W.blue,fontFamily:"monospace",fontWeight:700,flexShrink:0 }}>{eloScores[m.id]||1500}</span>
            </div>
          ))}
        </>}
        {tab==="saved"&&<>
          <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1 }}>MOVIES TO WATCH · {savedMovies.length} saved</div>
          {savedMovies.map(m=>(
            <div key={m.id} onClick={()=>onSelectMovie(m)} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:W.card,borderRadius:10,border:`1px solid ${W.blue}22`,cursor:"pointer" }}>
              <Poster url={m.poster_url} w={36} h={50} radius={6}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:11,fontWeight:700,color:W.text,fontFamily:"monospace" }}>{m.title}</div>
                <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{m.release_year} · {m.directors?.[0]?.name}</div>
              </div>
              <div style={{ fontSize:12,color:W.blue }}>◆</div>
            </div>
          ))}
        </>}
        {tab==="reviews"&&<div style={{ textAlign:"center",padding:"20px 0" }}><div style={{ fontSize:11,color:W.dim,fontFamily:"monospace" }}>{USER.review_count} reviews written</div></div>}
        {tab==="notes"&&<div style={{ textAlign:"center",padding:"20px 0" }}><div style={{ fontSize:11,color:W.dim,fontFamily:"monospace" }}>Private notes on your films</div></div>}
      </div>
      <NavBar active="profile" onNav={onNav}/>
    </div>
  );
};

const calcElo=(winnerElo,loserElo,k=32)=>{const exp=1/(1+Math.pow(10,(loserElo-winnerElo)/400));return[Math.round(winnerElo+k*(1-exp)),Math.round(loserElo+k*(0-(1-exp)))];};

const RankScreen = ({ newMovie, rankedIds, eloScores, onComplete, onCancel, allMovies }) => {
  const [lo,setLo]=useState(0);
  const [hi,setHi]=useState(rankedIds.length);
  const [localElo,setLocalElo]=useState({...eloScores,[newMovie.id]:1500});
  const [result,setResult]=useState(null);
  const [done,setDone]=useState(false);
  const [insertPos,setInsertPos]=useState(null);

  const midIdx=Math.floor((lo+hi)/2);
  const opponentId=rankedIds[midIdx];
  const opponent=allMovies.find(m=>m.id===opponentId);

  const pick=(winnerId)=>{
    const loserId=winnerId===newMovie.id?opponentId:newMovie.id;
    const [newW,newL]=calcElo(localElo[winnerId]||1500,localElo[loserId]||1500);
    setLocalElo(p=>({...p,[winnerId]:newW,[loserId]:newL}));
    const nextLo=winnerId===newMovie.id?lo:midIdx+1;
    const nextHi=winnerId===newMovie.id?midIdx:hi;
    setResult({chosenId:winnerId,otherId:loserId,nextLo,nextHi});
  };

  const advance=()=>{
    const{nextLo,nextHi}=result;
    setResult(null);
    if(nextLo>=nextHi){setInsertPos(nextLo);setDone(true);}
    else{setLo(nextLo);setHi(nextHi);}
  };

  useEffect(()=>{
    if(rankedIds.length===0){setInsertPos(0);setDone(true);}
  },[]);

  if(done&&insertPos!==null){
    const finalIds=[...rankedIds];
    finalIds.splice(insertPos,0,newMovie.id);
    const ranked=finalIds.map(id=>allMovies.find(m=>m.id===id)).filter(Boolean);
    return (
      <div style={{ position:"relative",height:"100%",overflowY:"auto" }}>
        <div style={{ padding:"8px 22px 6px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>⚡ RANKED!</span>
          <div onClick={onCancel} style={{ fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer" }}>✕</div>
        </div>
        <div style={{ padding:"0 22px 20px" }}>
          <div style={{ textAlign:"center",padding:"14px 0 10px" }}>
            <div style={{ fontSize:28 }}>🏆</div>
            <div style={{ fontSize:13,fontWeight:900,color:W.gold,fontFamily:"monospace",marginTop:6 }}>{newMovie.title} added!</div>
            <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:3 }}>Landed at #{insertPos+1} in your rankings</div>
          </div>
          <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",letterSpacing:1,marginBottom:8 }}>YOUR UPDATED RANKINGS</div>
          {ranked.map((m,i)=>(
            <div key={m.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",marginBottom:5,borderRadius:10,border:`1px solid ${m.id===newMovie.id?W.accent+"66":W.border}`,background:m.id===newMovie.id?W.accentDim:i===0?W.goldDim:W.card }}>
              <span style={{ fontSize:i<3?13:10,width:20,textAlign:"center",fontFamily:"monospace",fontWeight:900,color:W.dim,flexShrink:0 }}>{i<3?["🥇","🥈","🥉"][i]:i+1}</span>
              <Poster url={m.poster_url} w={28} h={38} radius={4}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:11,fontWeight:700,color:m.id===newMovie.id?W.accent:W.text,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{m.title}</div>
                <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{m.release_year}</div>
              </div>
              {m.id===newMovie.id&&<Badge color="red">NEW</Badge>}
              <div style={{ fontSize:9,color:W.blue,fontFamily:"monospace",fontWeight:700,flexShrink:0 }}>{localElo[m.id]||eloScores[m.id]||1500}</div>
            </div>
          ))}
          <div onClick={()=>onComplete(localElo,finalIds)} style={{ marginTop:10,background:W.accent,borderRadius:12,padding:"13px",textAlign:"center",fontSize:12,fontWeight:900,color:"#fff",fontFamily:"monospace",cursor:"pointer" }}>
            SAVE TO PROFILE →
          </div>
        </div>
      </div>
    );
  }

  if(!opponent) return null;
  const chosen=result?allMovies.find(m=>m.id===result.chosenId):null;
  const other=result?allMovies.find(m=>m.id===result.otherId):null;

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ flexShrink:0,padding:"8px 22px 6px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:13,fontWeight:800,color:W.text,fontFamily:"monospace" }}>⚡ RANK IT</span>
        <div onClick={onCancel} style={{ fontSize:11,color:W.dim,fontFamily:"monospace",cursor:"pointer" }}>✕ Cancel</div>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"0 22px",display:"flex",flexDirection:"column",gap:10 }}>
        <div style={{ background:`linear-gradient(135deg,${W.accent}10,${W.accent}04)`,border:`1px solid ${W.accent}33`,borderRadius:14,padding:"10px 14px",display:"flex",gap:12,alignItems:"center" }}>
          <Poster url={newMovie.poster_url} w={40} h={56} radius={6}/>
          <div>
            <div style={{ fontSize:8,color:W.accent,fontFamily:"monospace",fontWeight:700,letterSpacing:1 }}>PLACING IN YOUR LIST</div>
            <div style={{ fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginTop:2 }}>{newMovie.title}</div>
            <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace" }}>{newMovie.release_year} · {newMovie.directors?.[0]?.name}</div>
          </div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:10,color:W.dim,fontFamily:"monospace",letterSpacing:1 }}>WHICH DO YOU PREFER?</div>
          <div style={{ fontSize:8,color:W.dim,fontFamily:"monospace",marginTop:2 }}>~{Math.ceil(Math.log2(rankedIds.length+1))} comparisons to place it</div>
        </div>
        {!result?(
          <div style={{ display:"flex",gap:10 }}>
            {[newMovie,opponent].map(m=>(
              <div key={m.id} onClick={()=>pick(m.id)} style={{ flex:1,background:W.card,border:`1px solid ${W.border}`,borderRadius:16,padding:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8 }}>
                <Poster url={m.poster_url} w={100} h={140} radius={10}/>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:11,fontWeight:800,color:W.text,fontFamily:"monospace",lineHeight:1.3 }}>{m.title}</div>
                  <div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2 }}>{m.release_year}</div>
                  <div style={{ fontSize:8,color:W.dim,fontFamily:"monospace" }}>{m.directors?.[0]?.name}</div>
                  {m.id!==newMovie.id&&<div style={{ fontSize:8,color:W.blue,fontFamily:"monospace",marginTop:3,fontWeight:700 }}>currently #{rankedIds.indexOf(m.id)+1} in your list</div>}
                  {m.id===newMovie.id&&<div style={{ fontSize:8,color:W.accent,fontFamily:"monospace",marginTop:3,fontWeight:700 }}>NEW</div>}
                </div>
                <div style={{ background:W.accentDim,border:`1px solid ${W.accent}44`,borderRadius:10,padding:"7px 0",width:"100%",textAlign:"center",fontSize:10,fontWeight:900,color:W.accent,fontFamily:"monospace" }}>THIS ONE ▶</div>
              </div>
            ))}
          </div>
        ):(
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            <div style={{ background:W.greenDim,border:`1px solid ${W.green}44`,borderRadius:14,padding:14,display:"flex",gap:12,alignItems:"center" }}>
              <Poster url={chosen.poster_url} w={48} h={66} radius={8}/>
              <div><div style={{ fontSize:8,color:W.green,fontFamily:"monospace",fontWeight:700,letterSpacing:1 }}>✓ YOU PREFERRED</div><div style={{ fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginTop:2 }}>{chosen.title}</div><div style={{ fontSize:9,color:W.dim,fontFamily:"monospace",marginTop:2 }}>Narrowing down further…</div></div>
            </div>
            <div style={{ background:W.card,border:`1px solid ${W.border}`,borderRadius:14,padding:14,display:"flex",gap:12,alignItems:"center",opacity:0.6 }}>
              <Poster url={other.poster_url} w={48} h={66} radius={8}/>
              <div><div style={{ fontSize:8,color:W.dim,fontFamily:"monospace",fontWeight:700,letterSpacing:1 }}>✗ NOT THIS TIME</div><div style={{ fontSize:13,fontWeight:900,color:W.text,fontFamily:"monospace",marginTop:2 }}>{other.title}</div></div>
            </div>
            <div onClick={advance} style={{ background:W.accent,borderRadius:12,padding:"13px",textAlign:"center",fontSize:12,fontWeight:900,color:"#fff",fontFamily:"monospace",cursor:"pointer" }}>
              {result.nextLo>=result.nextHi?"FINISH RANKING →":"NEXT COMPARISON →"}
            </div>
          </div>
        )}
        {!result&&rankedIds.length>0&&(
          <div style={{ marginTop:4 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
              <span style={{ fontSize:8,color:W.dim,fontFamily:"monospace" }}>Narrowing position</span>
              <span style={{ fontSize:8,color:W.dim,fontFamily:"monospace" }}>window: {hi-lo} movies</span>
            </div>
            <div style={{ height:3,background:W.border,borderRadius:2 }}>
              <div style={{ height:"100%",background:W.accent,borderRadius:2,width:`${Math.max(5,100-((hi-lo)/Math.max(rankedIds.length,1)*100))}%`,transition:"width 0.3s" }}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function RatedApp() {
  const [loggedIn,setLoggedIn]=useState(false);
  const [screen,setScreen]=useState("home");
  const [selectedMovie,setSelectedMovie]=useState(null);
  const [rankMovie,setRankMovie]=useState(null);
  const [rankedIds,setRankedIds]=useState([]);
  const [eloScores,setEloScores]=useState({});
  const [backendUser,setBackendUser]=useState(null);
  const [backendConnected,setBackendConnected]=useState(false);
  const seeded=useRef(false);

  // Check backend health and seed movies on mount
  useEffect(()=>{
    if(seeded.current) return;
    seeded.current=true;
    (async()=>{
      const health=await api.healthCheck();
      if(!health){console.warn("Backend not available, running in offline mode");return;}
      setBackendConnected(true);
      console.log("Backend connected:",health);
      // Seed movies from catalog into backend
      for(const m of MOVIE_CATALOG){
        await api.seedMovie({movie_id:m.id,title:m.title,genre:m.genres?.[0]?.name||null,poster_url:m.poster_url||null,year:m.release_year||null});
      }
      console.log("Seeded",MOVIE_CATALOG.length,"movies to backend");
    })();
  },[]);

  const onNav=useCallback((s)=>{setScreen(s);setSelectedMovie(null);setRankMovie(null);},[]);
  const onSelectMovie=useCallback((m)=>{setSelectedMovie(m);setScreen("detail");},[]);
  const onBackToHome=useCallback(()=>{setScreen("home");setSelectedMovie(null);},[]);

  const onLogin=useCallback(async()=>{
    if(backendConnected){
      const result=await api.login("demo_sub|DemoUser|demo@rated.app");
      if(result){
        setBackendUser(result.user);
        console.log("Logged in as:",result.user);
      }
    }
    setLoggedIn(true);
  },[backendConnected]);

  const onRank=useCallback((m)=>{setRankMovie(m);setScreen("rank");},[]);

  const onRankComplete=useCallback(async(updatedElo,newIds)=>{
    setEloScores(updatedElo);setRankedIds(newIds);setRankMovie(null);setScreen("profile");
    // Persist rankings to backend
    if(backendConnected&&backendUser){
      for(const id of newIds){
        const score=Math.min(10,Math.max(1,Math.round(((updatedElo[id]||1500)-1200)/80)));
        await api.addRanking(backendUser.user_id,id,score);
      }
      console.log("Rankings synced to backend");
    }
  },[backendConnected,backendUser]);

  const onRankCancel=useCallback(()=>{setRankMovie(null);setScreen(selectedMovie?"detail":"home");},[selectedMovie]);

  const currentScreen=loggedIn?screen:"login";

  const navLabel=()=>{
    if(currentScreen==="detail") return selectedMovie?.title||"Detail";
    if(currentScreen==="login") return "Sign In";
    if(currentScreen==="rank") return "Ranking";
    return currentScreen;
  };

  const renderScreen=()=>{
    if(currentScreen==="login") return <LoginScreen onLogin={onLogin}/>;
    if(currentScreen==="home") return <HomeScreen onNav={onNav} onSelectMovie={onSelectMovie}/>;
    if(currentScreen==="detail") return <MovieDetailScreen movie={selectedMovie} onBack={onBackToHome} onRank={onRank}/>;
    if(currentScreen==="upcoming") return <UpcomingScreen onNav={onNav}/>;
    if(currentScreen==="leaderboard") return <LeaderboardScreen onNav={onNav} onSelectMovie={onSelectMovie}/>;
    if(currentScreen==="search") return <SearchScreen onNav={onNav} onSelectMovie={onSelectMovie}/>;
    if(currentScreen==="profile") return <ProfileScreen onNav={onNav} onSelectMovie={onSelectMovie} rankedIds={rankedIds} eloScores={eloScores}/>;
    if(currentScreen==="rank"&&rankMovie){
      if(rankedIds.includes(rankMovie.id)) return <div style={{ height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8 }}><div style={{ fontSize:24 }}>✓</div><div style={{ fontSize:11,color:W.green,fontFamily:"monospace" }}>Already ranked!</div><div onClick={onRankCancel} style={{ marginTop:12,fontSize:10,color:W.dim,fontFamily:"monospace",cursor:"pointer" }}>← Go back</div></div>;
      return <RankScreen newMovie={rankMovie} rankedIds={rankedIds} eloScores={eloScores} onComplete={onRankComplete} onCancel={onRankCancel} allMovies={MOVIE_CATALOG}/>;
    }
    return <HomeScreen onNav={onNav} onSelectMovie={onSelectMovie}/>;
  };

  return (
    <div style={{ minHeight:"100vh",background:"#08080b",padding:"20px 12px 40px",fontFamily:"system-ui" }}>
      <div style={{ textAlign:"center",marginBottom:16 }}>
        <h1 style={{ fontSize:26,fontWeight:900,color:W.accent,fontFamily:"monospace",letterSpacing:-1,margin:0,textShadow:`0 0 30px ${W.accent}33` }}>RATED</h1>
        <p style={{ fontSize:9,color:W.dim,fontFamily:"monospace",margin:"4px 0 0",letterSpacing:3 }}>DATA-DRIVEN PROTOTYPE · ENTITY → UI</p>
      </div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",maxWidth:560,margin:"0 auto 20px" }}>
        {Object.entries({login:"Login",home:"Home",upcoming:"Upcoming",search:"Search",leaderboard:"Board",profile:"Profile"}).map(([k,v])=>(
          <button key={k} onClick={()=>{if(k==="login"){setLoggedIn(false);setScreen("home");}else{setLoggedIn(true);onNav(k);}}} style={{ padding:"5px 11px",borderRadius:8,fontSize:9,fontFamily:"monospace",fontWeight:700,cursor:"pointer",border:`1px solid ${currentScreen===k||(["detail","rank"].includes(currentScreen)&&k==="home")?W.accent:W.border}`,background:currentScreen===k||(["detail","rank"].includes(currentScreen)&&k==="home")?W.accentDim:"transparent",color:currentScreen===k||(["detail","rank"].includes(currentScreen)&&k==="home")?W.accent:W.dim }}>{v}</button>
        ))}
      </div>
      <div style={{ display:"flex",justifyContent:"center" }}>
        <Phone label={navLabel()}>{renderScreen()}</Phone>
      </div>
      <div style={{ maxWidth:500,margin:"16px auto 0",textAlign:"center" }}>
        <p style={{ fontSize:9,color:W.dim,fontFamily:"monospace",lineHeight:1.6 }}>Apple ID & Google only · No passwords · Import watch history from 8 platforms</p>
        <p style={{ fontSize:9,fontFamily:"monospace",marginTop:6,color:backendConnected?W.green:W.dim }}>
          {backendConnected?"● Backend connected (localhost:8000)":"○ Backend offline — running with local data"}
          {backendUser&&` · Logged in as ${backendUser.name}`}
        </p>
      </div>
    </div>
  );
}
