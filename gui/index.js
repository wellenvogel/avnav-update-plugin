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
    let fetchList=function(){networkUpdate
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
                listFrame.appendChild(d)    
                data.data.forEach(function(le){
                    d=document.createElement('tr');
                    d.classList.add('listElement');
                    if (le.disabled){
                        d.classList.add('disabledPackage');
                        le.state="disabled";
                    }
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
                    e.checked=!!le.candidate && !!le.version && !le.disabled;
                    td.appendChild(e);
                    d.appendChild(td);
                    listFrame.appendChild(d);
                })
                hideShowDisabled();
            })
            .catch(function(error){
                alert("unable to fetch info: "+error);
            })
    }

    let hideShowDisabled=function(){
        let cb=document.getElementById('showDisabled');
        let disabledPackages=document.querySelectorAll('.disabledPackage');
        for (let i=0;i<disabledPackages.length;i++){
            if (cb.checked) disabledPackages[i].style.display='table-row';
            else disabledPackages[i].style.display='none';
        }
    }

    let closeWs=function(){
        if (webSocketConnection){
            try{
                webSocketConnection.close();
                webSocketConnection=undefined;
            }catch(e){console.log("error closing ws: "+e);}
        }
    }
    let showHideOverlay=function(id,show){
        let ovl=id;
        if (typeof(id) === 'string'){
            ovl=document.getElementById(id);
        }
        if (!ovl) return;
        ovl.style.visibility=show?'unset':'hidden';
        return ovl;
    }
    let closeOverlayFromButton=function(btEvent){
        let target=btEvent.target;
        while (target && target.parentElement){
            target=target.parentElement;
            if (target.classList.contains('overlayFrame')){
                showHideOverlay(target,false);
                return;
            }
        }
    }
    let buttonEnable=function(id,enable){
        let bt=id;
        if (typeof(id) === 'string'){
            bt=document.getElementById(id);
        }
        if (! bt) return;
        if (enable){
            bt.removeAttribute('disabled');
        }
        else{
            bt.setAttribute('disabled','');
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
                logElement.scrollTop=logElement.scrollHeight;
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
        buttonEnable('saveEditOverlay',changed && ! ignoreNextChanged);
        ignoreNextChanged=false;
    }

    let showEdit=function(){
        showHideOverlay('editOverlay',true);
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
                showHideOverlay('editOverlay',false);
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

    let buttonActions={
        reload: fetchList,
        updateList: function(){startAction('updateList')},
        updatePackages: function(){startAction('updatePackages')},
        restart: function(){startAction('restart')},
        showLog: showLog,
        showEdit: showEdit,
        closeOverlay: closeOverlayFromButton,
        downloadLogOverlay: function(){window.location.href='/api/downloadLog';},
        refreshLogOverlay: fillLog,
        closeLogOverlay: closeOverlayFromButton,
        downloadEditOverlay: function(){window.location.href='/api/downloadConfig';},
        saveEditOverlay: saveConfig,
        closeEditOverlay: closeOverlayFromButton,
        showConsole: function(){showConsole();}
    }
    window.addEventListener('load',function(){
        let title=document.getElementById('title');
        if (window.location.search.match(/title=no/)){
            if (title) title.style.display="none";
        }
        let buttons=document.querySelectorAll('button')
        for (let i=0;i<buttons.length;i++){
            let bt=buttons[i];
            let handler=buttonActions[bt.getAttribute('id')]||
                buttonActions[bt.getAttribute('name')];
            if (handler){
                bt.addEventListener('click',handler);
            }    

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
                let buttons=document.querySelectorAll('button.action');
                for (let i=0;i<buttons.length;i++){
                    buttonEnable(buttons[i],! data.actionRunning);
                }
                buttonEnable('showConsole',data.actionRunning);
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
                buttonEnable('showLog',data.logFile === 'read');
                buttonEnable('showEdit',data.configFile === 'read' 
                    || data.configFile === 'write');
                if (flask){
                    if (data.configFile !== 'write') {
                        flask.enableReadonlyMode();
                    }
                    else{
                        flask.disableReadonlyMode();
                    }

                }
                let sd=document.getElementById('showDisabled');
                if (sd) sd.addEventListener('change',hideShowDisabled)    
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