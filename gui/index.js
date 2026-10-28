(function(){
    const BETA_STATE={
        inactive: 'inactive',
        inactiveMod: 'inactive-mod',
        active: 'active',
        activeMod: 'active-mod'
    };
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
    let listStateTimer;
    let setListState=function(text,blink,autoClear){
        let el=document.getElementById('listState');
        if (! el) return;
        clearTimeout(listStateTimer);
        el.textContent=text;
        el.classList.toggle('blink',!!blink);
        if (autoClear){
            listStateTimer=setTimeout(function(){el.textContent='';},2500);
        }
    }
    let fetchList=function(){
        let listFrame=document.getElementById('infoFrame');
        if (! listFrame) return;
        listFrame.innerHTML='<li class="updateRunning blink">Reading Packages...</li>';
        setListState('Reading packages...',true);
        apiRequest('fetchList')
            .then(function(data){
                setListState('Package list updated',false,true);
                let allowDowngrade=document.getElementById('allowDowngrade')?.checked;
                let betaStatus=document.getElementById('betaStatus');
                let betaActive=false;
                let betaChange=false;
                listFrame.innerHTML='';
                data.data.forEach(function(le){
                    //compute candidate
                    let isDowngrade=false;
                    if (le.candidate == le.version) le.candidate=undefined;
                    if (! le.candidate && allowDowngrade){
                        let cv=le.versions[0]
                        if (cv){
                            if (cv.state < 0) {
                                isDowngrade=true;
                                le.candidate=cv.version;
                            }
                        }
                    }
                    if (le.beta == BETA_STATE.active || le.beta == BETA_STATE.activeMod){
                        betaActive=true;
                    }
                    if (le.beta == BETA_STATE.activeMod || le.beta == BETA_STATE.inactiveMod){
                        betaChange=true;
                    }
                    let hasCandidate=!!le.candidate;
                    let item=document.createElement('li');
                    item.classList.add('packageItem');
                    if (! hasCandidate) item.classList.add('noCandidate');
                    if (le.disabled){
                        item.classList.add('disabledPackage');
                        le.state="disabled";
                    }
                    let heading=document.createElement('div');
                    heading.classList.add('packageHeading');
                    let name=document.createElement('strong');
                    name.classList.add('packageName');
                    name.textContent=le.name || 'Unnamed package';
                    heading.appendChild(name);
                    let state=document.createElement('span');
                    state.classList.add('packageState');
                    state.textContent=le.state == null ? '—' : le.state;
                    heading.appendChild(state);
                    item.appendChild(heading);

                    let details=document.createElement('dl');
                    details.classList.add('packageDetails');
                    [['Installed version', le.version], ['Candidate version', le.candidate, isDowngrade]]
                        .forEach(function(detail){
                            let group=document.createElement('div');
                            let label=document.createElement('dt');
                            label.textContent=detail[0];
                            let value=document.createElement('dd');
                            let empty=detail[1] == null || detail[1] === '';
                            value.textContent=empty
                                ? (detail[2] === undefined ? '—' : 'no candidate') : detail[1];
                            if (empty && detail[2] !== undefined) value.classList.add('none');
                            if (detail[2]) value.classList.add('downgrade');
                            group.appendChild(label);
                            group.appendChild(value);
                            details.appendChild(group);
                        });
                    item.appendChild(details);

                    let selectLabel=document.createElement('label');
                    selectLabel.classList.add('packageSelect');
                    let checkbox=document.createElement('input');
                    checkbox.setAttribute('type','checkbox');
                    checkbox.setAttribute('data-name',le.name);
                    checkbox.setAttribute('aria-label','Select '+(le.name || 'package'));
                    if (le.candidate != null){
                        checkbox.setAttribute('data-version',le.candidate);
                    }
                    checkbox.disabled=!hasCandidate;
                    checkbox.checked=hasCandidate && !!le.version && !le.disabled && !isDowngrade;
                    let selectText=document.createElement('span');
                    selectText.textContent='Select for update';
                    selectLabel.appendChild(checkbox);
                    selectLabel.appendChild(selectText);
                    item.appendChild(selectLabel);
                    listFrame.appendChild(item);
                })
                hideShowDisabled();
                updateSelection();
                betaStatus.className="statusText "+(betaActive?'ok':'unknown');
                betaStatus.setAttribute('aria-label',betaActive?'Beta enabled':'Beta disabled');
                for (let bt of (['enableBeta','disableBeta'])){
                    const bte=document.getElementById(bt);
                    if (bte){
                        bte.style.display = betaChange ? 'inline-block' : 'none';
                        const disabled=(bt === 'enableBeta')?betaActive:!betaActive;
                        bte.setAttribute('data-disabled', disabled);
                    }
                }

            })
            .catch(function(error){
                setListState('Reading packages failed',false,true);
                alert("unable to fetch info: "+error);
            })
    }

    let actionRunning=false;
    let updateSelection=function(){
        let bt=document.getElementById('updatePackages');
        if (! bt) return;
        let selected=document.querySelector('#infoFrame input[type=checkbox]:checked');
        bt.setAttribute('data-disabled',selected?'false':'true');
        buttonEnable(bt,!actionRunning);
    }

    let hideShowDisabled=function(){
        let cb=document.getElementById('showDisabled');
        let disabledPackages=document.querySelectorAll('.disabledPackage');
        for (let i=0;i<disabledPackages.length;i++){
            disabledPackages[i].hidden=!cb.checked;
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
        let overwrite=bt.getAttribute('data-disabled');
        if (enable && ! (overwrite === 'true')){
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
                let version=tickedBoxes[i].getAttribute('data-version');
                if (name) {
                    if (version != null){
                        packageList.push(encodeURIComponent(name+ "=" +version));
                    }
                    else{
                        packageList.push(encodeURIComponent(name));
                    }
                }
            }
            if (packageList.length < 1) {
                showConsole("Error: no packages selected for update");
                return;
            }
            action += "?"
            packageList.forEach(function (p) {
                action += "package=" + p + "&";
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
        enableBeta: function(){startAction('enableBeta')},
        disableBeta: function(){startAction('disableBeta')},
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
                actionRunning=!!data.actionRunning;
                let buttons=document.querySelectorAll('button.action');
                for (let i=0;i<buttons.length;i++){
                    buttonEnable(buttons[i],! data.actionRunning);
                }
                updateSelection();
                buttonEnable('showConsole',data.actionRunning);
                let actionDisplay=document.getElementById('runningAction');
                if (actionDisplay){
                    if (data.actionRunning){
                        actionDisplay.classList.remove('stopped');
                        actionDisplay.classList.add('running');
                        let txt=actionDisplay.querySelector('.actionName');
                        if (txt){
                            txt.textContent=data.currentAction;
                        }
                    }
                    else{
                        actionDisplay.classList.remove('running');
                        actionDisplay.classList.add('stopped');
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
                if (lastUpdateSequence !== data.updateSequence){
                    lastUpdateSequence=data.updateSequence;
                    fetchList();
                }
            })
            .catch(function(error){
                console.log(error);
            })
        },1000);
        let infoFrame=document.getElementById('infoFrame');
        if (infoFrame) infoFrame.addEventListener('change',updateSelection);
        let sd=document.getElementById('showDisabled');
        if (sd) sd.addEventListener('change',hideShowDisabled)
        let allowDowngrade=document.getElementById('allowDowngrade')
        if (allowDowngrade) allowDowngrade.addEventListener("change",()=>{
                    fetchList()
        })   
        fetchList();
    })
})();