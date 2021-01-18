(function(){
    let webSocketConnection;
    let apiRequest=function(command){
        let url="/api/"+command;
        return new Promise(function(resolve,reject){
            fetch(url)
            .then(function(r){
                return r.json();
            })
            .then(function(data){
                if (! data.status || data.status !== 'OK'){
                    reject("status: "+data.status);
                    retturn;
                }
                resolve(data);
                return;
            })
            .catch(function(error){
                reject(error);
            });
        });
    }
    let fetchList=function(){
        let listFrame=document.getElementById('infoFrame');
        if (! listFrame) return;
        listFrame.innerHTML='';
        apiRequest('fetchList')
            .then(function(data){
                let fields=['name','state','version','candidate'];
                let d=document.createElement('tr');
                d.classList.add('listHeadline');
                fields.concat(['include']).forEach(function(f){
                    let e=document.createElement('th');
                    e.classList.add(f+"Hdg");
                    e.textContent=f;
                    d.appendChild(e);
                });
                listFrame.append(d)    
                data.data.forEach(function(le){
                    d=document.createElement('tr');
                    d.classList.add('listElement');
                    fields.forEach(function(f){
                        let e=document.createElement('td');
                        e.classList.add(f);
                        e.textContent=le[f];
                        d.appendChild(e);
                    });
                    let td=document.createElement('td');
                    e=document.createElement('input');
                    e.setAttribute('type','checkbox');
                    e.setAttribute('data-name',le.name);
                    e.checked=!!le.candidate;
                    td.appendChild(e);
                    d.appendChild(td);
                    listFrame.appendChild(d);
                })
            })
            .catch(function(error){
                alert("unable to fetch info: "+error);
            })
    }

    let closeWs=function(){
        if (webSocketConnection){
            try{
                webSocketConnection.close();
                webSocketConnection=undefined;
            }catch(e){console.log("error closing ws: "+e);}
        }
    }
    let showHideShowCb=function(show){
        let b=document.getElementById('showConsole');
        if (!b) return;
        if (show) b.style.visibility='inherit';
        else b.style.visibility='hidden';
    }
    let showConsole=function(opt_text){
        let overlay=document.getElementById('responseOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        let content=overlay.querySelector('.overlayContent');
        closeWs();
        showHideShowCb(false);
        if (opt_text){
            content.textContent=opt_text;
            return;
        }
        content.textContent=''
        //open ws here
        try{
            webSocketConnection=new WebSocket('ws://'+window.location.host+"/api/ws");
            webSocketConnection.onmessage=function(message){
                content.textContent+="\n"+message.data;
                content.scrollTop=content.scrollHeight;
            }
            webSocketConnection.onopen=function(){
                
            }
            webSocketConnection.onerror=function(err){
                alert("websocket error: "+err.currentTarget.url);
            }
        }catch (e){
            alert("unable to open websocket: "+e);
        }
    }


    window.addEventListener('load',function(){
        let cb=document.getElementById('closeOverlay');
        if (cb){
            cb.addEventListener('click',function(){
                closeWs();
                let ov=document.getElementById('responseOverlay');
                if (ov) ov.style.visibility='hidden';
                showHideShowCb(true);
            })
        }
        let actionButtons=['refresh','updateList','updatePackages','restart'];
        actionButtons.forEach(function(bt){
            let bel=document.getElementById(bt);
            if (bel){
                bel.addEventListener('click',function(ev){
                    let action=ev.target.getAttribute('data-action');
                    if (!action) return;
                    if (action === 'reload'){
                        fetchList();
                        return;
                    }
                    if (action === 'updateList' || action === 'updatePackages' || action == 'restart'){
                        showConsole();
                    }
                    apiRequest(action)
                        .then(function(response){
                            fetchList();
                        })
                        .catch(function(error){
                            showConsole("Error: "+error);
                        })
                })
            }
        })
        let showCb=this.document.getElementById('showConsole');
        if (showCb){
            showCb.addEventListener('click',function(){showConsole();});
        }
        this.window.setInterval(function(){
            apiRequest('status')
            .then(function(data){
                let buttons=document.querySelectorAll('.buttonFrame button');
                for (let i=0;i<buttons.length;i++){
                    if (!buttons[i].getAttribute('data-action')) continue;
                    if (data.actionRunning){
                        buttons[i].setAttribute('disabled','');
                    }
                    else{
                        buttons[i].removeAttribute('disabled');
                    }
                }
                let actionDisplay=document.getElementById('runningAction');
                if (actionDisplay){
                    if (data.actionRunning){
                        actionDisplay.classList=['running'];
                        let txt=actionDisplay.querySelector('.actionName');
                        if (txt){
                            txt.textContent=data.currentAction;
                        }
                    }
                    else{
                        actionDisplay.classList=['stopped'];
                    }
                }
            })
            .catch(function(error){
                console.log(error);
            })
        },1000);
        fetchList();
    })
})();