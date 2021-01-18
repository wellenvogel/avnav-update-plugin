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
                data.list.forEach(function(le){
                    let d=document.createElement('div');
                    d.classList.add('listElement');
                    d.textContent=le;
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

    let showConsole=function(opt_text){
        let overlay=document.getElementById('responseOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        let content=overlay.querySelector('.overlayContent');
        closeWs();
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
            }
            webSocketConnection.onopen=function(){
                webSocketConnection.send("Hello!");
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
            })
        }
        let actionButtons=['refresh','updateList','updatePackages','restart'];
        actionButtons.forEach(function(bt){
            let bel=document.getElementById(bt);
            if (bel){
                bel.addEventListener('click',function(ev){
                    let action=ev.target.getAttribute('data-action');
                    if (!action) return;
                    if (action === 'updateList' || action === 'updatePackages' || action == 'restart'){
                        showConsole();
                    }
                    apiRequest(action)
                        .then(function(response){
                            if (action === 'reload'){
                                fetchList();
                            }
                        })
                        .catch(function(error){
                            showConsole("Error: "+error);
                        })
                })
            }
        })
        this.window.setInterval(function(){
            apiRequest('status')
            .then(function(data){
                let buttons=document.querySelectorAll('.buttonFrame button');
                for (let i=0;i<buttons.length;i++){
                    if (data.actionRunning){
                        buttons[i].setAttribute('disabled','');
                    }
                    else{
                        buttons[i].removeAttribute('disabled');
                    }
                }
            })
            .catch(function(error){})
        },1000);
    })
})();