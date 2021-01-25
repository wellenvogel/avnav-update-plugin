(function(){
    let webSocketConnection;
    let lastUpdateSequence;
    let flask;
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
        listFrame.innerHTML='<div class="updateRunning blink">Reading Packages...</div>';
        apiRequest('fetchList')
            .then(function(data){
                listFrame.innerHTML='';
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
                    e.checked=!!le.candidate && !!le.version;
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

    let fillLog=function(){
        let logElement=document.querySelector('#logOverlay .overlayContent');
        if (! logElement) return;
        fetch('/api/getLog?maxSize=100000')
            .then(function(resp){
                return resp.text();
            })
            .then(function(text){
                logElement.textContent=text;
            })
            .catch(function(error){
                showConsole(error);
            })
    }

    let showLog=function(){
        let overlay=document.getElementById('logOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        fillLog();
    }
    let ignoreNextChanged=false;
    let codeChanged=function(changed){
        let b=document.getElementById('saveEditOverlay');
        if (! b ) return;
        if (changed && ! ignoreNextChanged){
            b.removeAttribute('disabled');
        }
        else{
            b.setAttribute('disabled','');
        }
        ignoreNextChanged=false;
    }

    let showEdit=function(){
        let overlay=document.getElementById('editOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        fetch('/api/getConfig')
        .then(function(resp){
            return resp.text();
        })
        .then(function(text){
            if (flask) flask.updateCode(text);
            codeChanged(false);
            ignoreNextChanged=true;
        })
        .catch(function(error){
            showConsole(error);
        })
    }
    let parseXml=function(text){
        let xmlDoc=undefined;
        if (window.DOMParser) {
            // code for modern browsers
            let parser = new DOMParser();
            xmlDoc = parser.parseFromString(text,"text/xml");
        } else {
            // code for old IE browsers
            xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = false;
            xmlDoc.loadXML(text);
        }
        return xmlDoc;
    };

    let saveConfig=function(){
        if (! flask) return;
        let data=flask.getCode();
        try{
            let doc=parseXml(data);
            let errors=doc.getElementsByTagName('parsererror');
            if (errors.length > 0){
                showConsole("invalid xml: "+errors[0].textContent.replace(/ *[bB]elow is a .*/,''));
                return;
            }
        }catch(e){
            showConsole("internal error: "+e);
            return;
        }
        if (confirm("Really overwrite AvNav config and restart AvNav?")){
            fetch('/api/uploadConfig',{
                method: 'POST',
                headers:{
                    'Content-Type':'text/plain'
                },
                body: data
            })
            .then(function(resp){
                return resp.json();
            })
            .then(function(result){
                if (! result.status || result.status !== 'OK'){
                    showConsole(result.status);
                    return;
                }
                let overlay=document.getElementById('editOverlay');
                if (! overlay) return;
                overlay.style.visibility='hidden';
                startAction('restart');
            })
            .catch(function(error){
                showConsole(error);
            })
            return ;
        }
    }

    let statusToText=function(status){
        if (status === 1) return "running";
        if (status === 2) return "stopped";
        if (status === 3) return "not installed";
    }
    let startAction = function (action) {
        if (!action) return;
        if (action == 'showLog') {
            showLog();
            return;
        }
        if (action == 'showEdit') {
            showEdit();
            return;
        }
        if (action === 'reload') {
            fetchList();
            return;
        }
        if (action === 'updatePackages') {
            let tickedBoxes = document.querySelectorAll('#infoFrame input[type=checkbox]:checked');
            let packageList = [];
            for (let i = 0; i < tickedBoxes.length; i++) {
                let name = tickedBoxes[i].getAttribute('data-name');
                if (name) packageList.push(name);
            }
            if (packageList.length < 1) {
                showConsole("Error: no packages selected for update");
                return;
            }
            action += "?"
            packageList.forEach(function (p) {
                action += "package=" + encodeURIComponent(p) + "&";
            });
        }
        apiRequest(action)
            .then(function (response) {
                showConsole();
            })
            .catch(function (error) {
                showConsole("Error: " + error);
            })
    };
    window.addEventListener('load',function(){
        let title=document.getElementById('title');
        if (window.location.search.match(/title=no/)){
            if (title) title.style.display="none";
        }
        let cb=document.getElementById('closeOverlay');
        if (cb){
            cb.addEventListener('click',function(){
                closeWs();
                let ov=document.getElementById('responseOverlay');
                if (ov) ov.style.visibility='hidden';
                showHideShowCb(true);
            })
        }
        let clb=document.getElementById('closeLogOverlay');
        if (clb){
            clb.addEventListener('click',function(){
                let ov=document.getElementById('logOverlay');
                if (ov) ov.style.visibility='hidden';
            })
        }
        clb=document.getElementById('refreshLogOverlay');
        if (clb){
            clb.addEventListener('click',function(){
                fillLog();
            })
        }
        clb=document.getElementById('downloadLogOverlay');
        if (clb){
            clb.addEventListener('click',function(){
                window.location.href='/api/downloadLog';
            })
        }
        let ecb=document.getElementById('closeEditOverlay');
        if (ecb){
            ecb.addEventListener('click',function(){
                let ov=document.getElementById('editOverlay');
                if (ov) ov.style.visibility='hidden';
            })
        }
        ecb=document.getElementById('saveEditOverlay');
        if (ecb){
            ecb.addEventListener('click',function(){
                if (! saveConfig()) return;
                let ov=document.getElementById('editOverlay');
                if (ov) ov.style.visibility='hidden';
            }) 
        }
        let actionButtons=['refresh','updateList','updatePackages',
            'restart','showLog','showEdit'];
        actionButtons.forEach(function(bt){
            let bel=document.getElementById(bt);
            if (bel){
                bel.addEventListener('click',function(ev){
                    let action=ev.target.getAttribute('data-action');
                    startAction(action);
                })
            }
        })
        let showCb=this.document.getElementById('showConsole');
        if (showCb){
            showCb.addEventListener('click',function(){showConsole();});
        }
        flask=new CodeFlask('#editOverlay .overlayContent',{
            language: 'markup',
            lineNumbers: true,
            defaultTheme: false
        });
        flask.onUpdate(function(){codeChanged(true)});
        let updateNetworkActive=document.getElementById('networkUpdate');
        let networkState=document.getElementById('networkStatus');
        let first=true;
        this.window.setInterval(function(){
            let url='status';
            if (first || updateNetworkActive && updateNetworkActive.checked){
                first=false;
                url+="?includeNet=1";
            }
            apiRequest(url)
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
                let statusText=document.getElementById('avnavStatusText');
                if (statusText){
                    statusText.textContent=statusToText(data.avnavRunning);
                    statusText.setAttribute('data-status',data.avnavRunning);
                }
                if (networkState){
                    let newState='unknown';
                    if (data.network !== undefined){
                        if (data.network) newState='ok';
                        else newState='error';
                    }
                    if (! networkState.classList.contains(newState)){
                        let states=['unknown','error','ok'];
                        states.forEach(function(state){
                            if (state !== newState){
                                networkState.classList.remove(state);
                            }
                            else{
                                networkState.classList.add(state);
                            }
                        });
                    }
                }
                let logButton=document.getElementById('showLog');
                if (logButton){
                    if (data.logFile === 'read'){
                        logButton.removeAttribute('disabled');
                    }
                    else{
                        logButton.setAttribute('disabled','');
                    }
                }
                let editButton=document.getElementById('showEdit');
                if (editButton){
                    if (data.configFile === 'read' || data.configFile === 'write'){
                        editButton.removeAttribute('disabled');
                    }
                    else{
                        editButton.setAttribute('disabled','');
                    }
                }
                if (lastUpdateSequence !== data.updateSequence){
                    lastUpdateSequence=data.updateSequence;
                    fetchList();
                }
            })
            .catch(function(error){
                console.log(error);
            })
        },1000);
        fetchList();
    })
})();